import type { SupabaseClient } from "@supabase/supabase-js";
import { alertNewLead } from "@/lib/lead-alerts";
import { ingestLead, leadRow, logLeadActivity, type IncomingLead } from "@/lib/leads";
import { refreshGoogleAccessToken } from "@/lib/integrations/oauth";
import { leadFingerprint, mergeSheetLeads, tabToLeads, type Cell, type SheetLead } from "@/lib/sheet-leads-parse";

/**
 * Leads from a Google Sheet (lead_sources.kind "google_sheet", migration 0047).
 * Someone with access to the sheet connects it once (read-only Google grant,
 * refresh token in lead_sources.access_token); the every-minute lead poll then
 * reads the chosen tabs. New rows become leads, changed rows (a half-filled form
 * that was finished) update theirs. Alerts (email, urgent push, 60 s screen) go
 * out once, when a lead first has a phone number or email.
 */

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_TABS = 10;

export interface SheetConfig {
  spreadsheetId?: string;
  title?: string;
  timeZone?: string;
  /** Zone of text timestamps written by form scripts (default Europe/Berlin). */
  textTimeZone?: string;
  tabs?: string[];
  /** Fingerprint per lead id: unchanged rows are skipped. */
  hashes?: Record<string, string>;
  /** Set once the first import is through; until then only very fresh leads alert. */
  importedAt?: string;
}

export class SheetError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gget(token: string, path: string) {
  const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!res) throw new SheetError(0, "Google Sheets is not reachable.");
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new SheetError(res.status, String(json?.error?.message ?? `HTTP ${res.status}`).slice(0, 300));
  return json;
}

const a1 = (tab: string, range: string) => `'${tab.replace(/'/g, "''")}'!${range}`;

export interface SheetTabInfo {
  title: string;
  index: number;
  hidden: boolean;
}

/** Title, time zone and tabs of a spreadsheet (also proves the grant can read it). */
export async function sheetMeta(token: string, spreadsheetId: string): Promise<{ title: string; timeZone: string; tabs: SheetTabInfo[] }> {
  const j = await gget(token, `${encodeURIComponent(spreadsheetId)}?fields=properties(title,timeZone),sheets.properties(title,index,hidden)`);
  return {
    title: String(j?.properties?.title ?? "Google Sheet"),
    timeZone: String(j?.properties?.timeZone ?? "Europe/Berlin"),
    tabs: ((j?.sheets ?? []) as any[]).map((s) => ({ title: String(s.properties?.title ?? ""), index: Number(s.properties?.index ?? 0), hidden: !!s.properties?.hidden })).filter((t) => t.title),
  };
}

/** Cell values of tabs (dates as serial numbers, so the sheet's own time zone applies). */
export async function readTabs(token: string, spreadsheetId: string, tabs: string[], range = "A1:CZ5000"): Promise<Record<string, Cell[][]>> {
  if (!tabs.length) return {};
  const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER", majorDimension: "ROWS" });
  for (const t of tabs) qs.append("ranges", a1(t, range));
  const j = await gget(token, `${encodeURIComponent(spreadsheetId)}/values:batchGet?${qs}`);
  const out: Record<string, Cell[][]> = {};
  ((j?.valueRanges ?? []) as any[]).forEach((vr, i) => {
    out[tabs[i]] = (vr?.values ?? []) as Cell[][];
  });
  return out;
}

/** Fresh access token for a sheet source, or null when the grant is gone. */
export const sheetToken = (refreshToken: string | null) => (refreshToken ? refreshGoogleAccessToken(refreshToken) : Promise.resolve(null));

/** Plain-language reason for a failed read, stored on the source. */
export function sheetErrorText(e: unknown): string {
  const st = e instanceof SheetError ? e.status : 0;
  if (st === 403) return "Kein Zugriff mehr auf das Sheet. Bitte mit einem Konto neu verbinden, das das Sheet sehen kann.";
  if (st === 404) return "Sheet nicht gefunden (gelöscht oder verschoben). Bitte neu verbinden.";
  if (st === 400) return `Ein Tab fehlt oder wurde umbenannt. Bitte Tabs neu wählen. (${(e as Error).message.slice(0, 120)})`;
  return `Sheet konnte nicht gelesen werden: ${(e as Error)?.message?.slice(0, 160) ?? "unbekannter Fehler"}`;
}

export interface SheetSyncResult {
  added: number;
  updated: number;
  alerted: number;
  /** Rows left for the next run (time budget reached). */
  pending: number;
  error?: string;
}

type ExistingLead = { id: string; client_id: string; lead_no: number; name: string | null; email: string | null; phone: string | null; tags: string[] | null };

const isComplete = (tags: string[] | null | undefined) => (tags ?? []).some((t) => /vollst|complete/i.test(t));

/** Sync one google_sheet source. Never throws: problems land on the source row. */
export async function syncSheetSource(
  admin: SupabaseClient,
  src: { id: string; client_id: string; external_id: string | null; access_token: string | null; config: SheetConfig | null },
  opts: { budgetMs?: number } = {},
): Promise<SheetSyncResult> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 25_000;
  const res: SheetSyncResult = { added: 0, updated: 0, alerted: 0, pending: 0 };
  const cfg: SheetConfig = src.config ?? {};
  const tabs = (cfg.tabs ?? []).slice(0, MAX_TABS);
  if (!src.external_id || !tabs.length) return res;
  const fail = async (msg: string) => {
    await admin.from("lead_sources").update({ status: "error", last_error: msg.slice(0, 300), last_synced_at: new Date().toISOString() }).eq("id", src.id);
    return { ...res, error: msg };
  };

  const token = await sheetToken(src.access_token);
  if (!token) return fail("Google-Zugriff abgelaufen oder entzogen. Bitte das Sheet neu verbinden.");
  let data: Record<string, Cell[][]>;
  try {
    data = await readTabs(token, src.external_id, tabs);
  } catch (e) {
    return fail(sheetErrorText(e));
  }

  // Real date cells are in the sheet's zone; text times as the form scripts
  // write them (German local time unless configured otherwise).
  const tz = cfg.timeZone || "Europe/Berlin";
  const leads = mergeSheetLeads(tabs.map((t) => tabToLeads(t, data[t] ?? [], tz, cfg.textTimeZone || "Europe/Berlin")));
  // Oldest first, so lead numbers follow the order people sent their forms.
  leads.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const old = cfg.hashes ?? {};
  // Until the first import is through, only leads from the last 3 h alert
  // (no burst of old enquiries); afterwards a day, like the Meta poll.
  const maxAgeMs = (cfg.importedAt ? 24 * 60 : 180) * 60_000;
  const fresh = (l: SheetLead) => !l.createdAt || Date.now() - Date.parse(l.createdAt) < maxAgeMs;
  const hasContact = (l: SheetLead) => !!(l.contact.email || l.contact.phone);

  const next: Record<string, string> = {};
  const changed: SheetLead[] = [];
  for (const l of leads) {
    const fp = leadFingerprint(l);
    if (old[l.externalId] === fp) next[l.externalId] = fp;
    else changed.push(l);
  }

  // Which of the changed ones exist already.
  const existing = new Map<string, ExistingLead>();
  for (let i = 0; i < changed.length; i += 150) {
    const ids = changed.slice(i, i + 150).map((l) => l.externalId);
    const { data: rows } = await admin.from("leads").select("id,client_id,lead_no,name,email,phone,tags,external_id").eq("client_id", src.client_id).eq("source", "webhook").in("external_id", ids);
    for (const r of (rows ?? []) as (ExistingLead & { external_id: string })[]) existing.set(r.external_id, r);
  }

  const incoming = (l: SheetLead, notify: boolean): IncomingLead => ({
    clientId: src.client_id,
    source: "webhook",
    sourceId: src.id,
    externalId: l.externalId,
    createdAt: l.createdAt,
    fields: l.fields,
    campaign: l.campaign,
    form: l.form,
    platform: l.platform,
    tags: l.tags,
    contact: l.contact,
    notify,
  });

  // New leads nobody needs to be alerted about (older ones, anonymous partials)
  // go in batches: the first import of a busy sheet is hundreds of rows.
  const fresh_new = changed.filter((l) => !existing.has(l.externalId) && hasContact(l) && fresh(l));
  const silent_new = changed.filter((l) => !existing.has(l.externalId) && !(hasContact(l) && fresh(l)));
  for (let i = 0; i < silent_new.length; i += 50) {
    if (Date.now() - t0 > budget) break;
    const chunk = silent_new.slice(i, i + 50);
    const { data: ins, error } = await admin
      .from("leads")
      // Same columns on every row of a batch insert.
      .insert(chunk.map((l) => ({ tags: [] as string[], ...leadRow(incoming(l, false)) })))
      .select("id,lead_no,external_id,client_id");
    if (error) {
      // One row clashed (e.g. a parallel run): fall back to one by one.
      for (const l of chunk) {
        const r = await ingestLead(admin, incoming(l, false));
        if ("error" in r) res.error = r.error;
        else {
          if (!r.duplicate) res.added++;
          next[l.externalId] = leadFingerprint(l);
        }
      }
      continue;
    }
    res.added += ins?.length ?? 0;
    if (ins?.length) {
      await admin.from("lead_activities").insert(
        ins.map((r) => ({ lead_id: r.id, client_id: r.client_id, user_id: null, kind: "created", body: null, meta: { source: "webhook", form: chunk.find((l) => l.externalId === r.external_id)?.form ?? null, via: "google_sheet" } })),
      );
    }
    for (const l of chunk) next[l.externalId] = leadFingerprint(l);
  }

  // Fresh leads with a way to reach them: one by one, each with its alert.
  for (const l of fresh_new) {
    if (Date.now() - t0 > budget) break;
    const r = await ingestLead(admin, incoming(l, true));
    if ("error" in r) {
      res.error = r.error;
      continue;
    }
    if (!r.duplicate) {
      res.added++;
      res.alerted++;
    }
    next[l.externalId] = leadFingerprint(l);
  }

  // Leads that changed in the sheet (more answers, finished, phone added).
  for (const l of changed) {
    const ex = existing.get(l.externalId);
    if (!ex) continue;
    if (Date.now() - t0 > budget) break;
    const base = leadRow(incoming(l, false));
    const patch: Record<string, unknown> = {
      fields: base.fields,
      campaign: base.campaign,
      form: base.form,
      platform: base.platform,
      updated_at: new Date().toISOString(),
      ...("tags" in base ? { tags: base.tags } : {}),
      // The time can appear later (or be corrected) in the sheet.
      ...(l.createdAt ? { created_at: base.created_at } : {}),
    };
    if (!ex.name && base.name) patch.name = base.name;
    const contact: Record<string, unknown> = {};
    if (!ex.email && base.email) contact.email = base.email;
    if (!ex.phone && base.phone) contact.phone = base.phone;

    if (!ex.email && !ex.phone && Object.keys(contact).length) {
      // First phone/email: now sales can act, so alert, once. Only the run
      // that actually fills the empty contact sends it.
      const { data: flipped } = await admin.from("leads").update({ ...patch, ...contact }).eq("id", ex.id).is("email", null).is("phone", null).select("*").maybeSingle();
      if (flipped && fresh(l)) {
        await alertNewLead(admin, flipped as any).catch(() => null);
        res.alerted++;
      } else if (!flipped) await admin.from("leads").update(patch).eq("id", ex.id);
    } else {
      await admin.from("leads").update({ ...patch, ...contact }).eq("id", ex.id);
    }
    if (!isComplete(ex.tags) && l.complete) await logLeadActivity(admin, ex, null, "edit", "Formular abgeschlossen (Google Sheet)", { via: "google_sheet" });
    res.updated++;
    next[l.externalId] = leadFingerprint(l);
  }

  res.pending = leads.filter((l) => !next[l.externalId]).length;

  // Re-read the config right before writing: the tabs may have been changed meanwhile.
  const { data: cur } = await admin.from("lead_sources").select("config").eq("id", src.id).maybeSingle();
  const curCfg = ((cur?.config ?? {}) as SheetConfig) || {};
  const now = new Date().toISOString();
  await admin
    .from("lead_sources")
    .update({
      config: { ...curCfg, hashes: next, ...(res.pending === 0 && !curCfg.importedAt ? { importedAt: now } : {}) },
      last_synced_at: now,
      status: res.error ? "error" : "active",
      last_error: res.error ? `Einige Zeilen konnten nicht gespeichert werden: ${res.error.slice(0, 200)}` : null,
      ...(res.added ? { last_received_at: now } : {}),
    })
    .eq("id", src.id);
  return res;
}

/** All google_sheet sources (or one partner's / one source), within a time budget. */
export async function syncSheetLeads(admin: SupabaseClient, opts: { clientId?: string; sourceId?: string; budgetMs?: number } = {}): Promise<SheetSyncResult> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? 25_000;
  let q = admin.from("lead_sources").select("id,client_id,external_id,access_token,config").eq("kind", "google_sheet").neq("status", "disconnected");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.sourceId) q = q.eq("id", opts.sourceId);
  const { data: sources, error } = await q;
  const total: SheetSyncResult = { added: 0, updated: 0, alerted: 0, pending: 0 };
  // Before migration 0047 the kind (and config column) don't exist: nothing to do.
  if (error || !sources?.length) return total;
  for (const s of sources as any[]) {
    const left = budget - (Date.now() - t0);
    if (left < 2_000) break;
    const r = await syncSheetSource(admin, s, { budgetMs: left });
    total.added += r.added;
    total.updated += r.updated;
    total.alerted += r.alerted;
    total.pending += r.pending;
    if (r.error) total.error = r.error;
  }
  return total;
}
