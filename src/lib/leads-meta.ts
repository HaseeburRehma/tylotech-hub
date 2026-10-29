import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "@/lib/http";
import { META_GRAPH_VERSION } from "@/lib/integrations/fetchers";
import { ingestLead, type LeadField } from "@/lib/leads";

/**
 * Meta Lead Ads → Leads.
 *
 * Connect: the partner (or the team) signs in with Facebook; the callback keeps
 * the user token in a short-lived encrypted cookie and the Leads page asks which
 * of the granted pages belong to this partner (an agency login sees every
 * client's pages — never attach them all). Each chosen page becomes a lead
 * source with its page token and is subscribed to this app's "leadgen" webhook. New leads then arrive in
 * real time (POST /api/leads/meta/webhook); "Sync" and the daily cron also
 * pull the last days from every lead form, so nothing is missed if a webhook
 * is lost or not configured yet.
 *
 * Needs on the Meta app: permissions leads_retrieval, pages_show_list,
 * pages_read_engagement, pages_manage_metadata, pages_manage_ads, ads_read,
 * business_management (pages managed through a Business portfolio only hand
 * out page tokens with it; Advanced Access via App Review for partners' pages),
 * a Login for Business configuration (META_LEADS_CONFIG_ID) and a Page webhook
 * subscription to "leadgen" pointing at /api/leads/meta/webhook with
 * metaWebhookVerifyToken().
 */

export const META_LEADS_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval", "ads_read", "business_management"].join(",");

/** Scopes whose granular target ids are pages (business_management targets businesses). */
const PAGE_SCOPES = new Set(["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval"]);

/**
 * Login dialog parameters. The TyloTech Hub app is a Business app with
 * "Facebook Login for Business": it ignores `scope` for permissions that aren't
 * in a saved configuration ("Invalid Scopes" dialog). With META_LEADS_CONFIG_ID
 * (Login for Business → Configurations) the dialog asks for exactly that
 * configuration's permissions; without it we fall back to plain scopes.
 */
export function metaLeadsLoginParams(): Record<string, string> {
  const configId = process.env.META_LEADS_CONFIG_ID?.trim();
  if (configId && /^\d+$/.test(configId)) return { config_id: configId, response_type: "code", override_default_response_type: "true" };
  return { scope: META_LEADS_SCOPES, response_type: "code", auth_type: "rerequest" };
}

const G = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const metaApp = () => {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  return id && secret ? { id, secret } : null;
};

/** Verify token for the webhook setup in the Meta app dashboard (derived — no extra env var). */
export function metaWebhookVerifyToken() {
  const app = metaApp();
  return app ? createHmac("sha256", app.secret).update("tylohq-leads-webhook").digest("hex").slice(0, 32) : null;
}

/** X-Hub-Signature-256 check for webhook deliveries. */
export function verifyMetaSignature(raw: string, header: string | null) {
  const app = metaApp();
  if (!app || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", app.secret).update(raw).digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  // Retried on 429/5xx; the one POST (subscribe a page) is idempotent at Meta.
  const res = await fetchWithRetry(
    `${G}/${path}${method === "GET" ? `?${qs}` : ""}`,
    { method, headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined, body: method === "POST" ? qs : undefined, cache: "no-store" },
    { timeoutMs: 15000 },
  );
  if (!res) throw new Error("Meta not reachable");
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new GraphError(json.error?.message ?? `Graph ${res.status}`, json.error?.code ?? null, regainMinutes(res.headers.get("x-business-use-case-usage")));
  return json;
}

/** A Graph error with Meta's code and, when throttled, how long until access returns. */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly regainMinutes: number | null,
  ) {
    super(message);
  }
}

/** Longest `estimated_time_to_regain_access` (minutes) in a business use case usage header. */
export function regainMinutes(header: string | null): number | null {
  if (!header) return null;
  try {
    const usage = JSON.parse(header) as Record<string, { estimated_time_to_regain_access?: number }[]>;
    const all = Object.values(usage).flat().map((u) => Number(u.estimated_time_to_regain_access) || 0);
    return all.length ? Math.max(...all) : null;
  } catch {
    return null;
  }
}

// Throttling: app (4), user (17), page (32), API (613) and the business use case
// limits (80000-80014; 80005 = leadgen calls per page, sized by the page's lead volume).
export const isMetaRateLimit = (e: unknown) => e instanceof GraphError && e.code != null && ([4, 17, 32, 613].includes(e.code) || (e.code >= 80000 && e.code <= 80014));

/**
 * OAuth callback for provider "meta_leads": code → long-lived user token, after
 * checking that the lead permissions were granted.
 */
export async function exchangeMetaCode(opts: { code: string; redirectUri: string }) {
  const app = metaApp();
  if (!app) throw new Error("not_configured");
  const short = await fetch(
    `${G}/oauth/access_token?${new URLSearchParams({ client_id: app.id, client_secret: app.secret, redirect_uri: opts.redirectUri, code: opts.code })}`,
    { cache: "no-store" },
  ).then((r) => r.json() as Promise<{ access_token?: string }>);
  if (!short.access_token) throw new Error("token_exchange");
  const long = await fetch(
    `${G}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: short.access_token })}`,
    { cache: "no-store" },
  ).then((r) => r.json() as Promise<{ access_token?: string }>);
  const userToken = long.access_token ?? short.access_token;

  const perms = await graph<{ data: { permission: string; status: string }[] }>("me/permissions", userToken);
  const granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
  if (!granted.has("leads_retrieval") || !granted.has("pages_show_list")) throw new Error("missing_scope");
  return userToken;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
}

/**
 * Pages this login may use: /me/accounts plus the pages picked in the Login for
 * Business dialog (granular scopes) — business-managed pages are often missing
 * from /me/accounts. Pages without a page token (no task on the page) are kept
 * so the picker can say why they can't be connected.
 */
export async function listMetaPages(userToken: string): Promise<MetaPage[]> {
  const app = metaApp();
  if (!app) throw new Error("not_configured");
  const pages = new Map<string, MetaPage>();
  let after: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await graph<{ data: MetaPage[]; paging?: { cursors?: { after?: string }; next?: string } }>("me/accounts", userToken, {
      fields: "id,name,access_token",
      limit: "100",
      ...(after ? { after } : {}),
    });
    for (const p of res.data) pages.set(p.id, p);
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }

  const fromAccounts = pages.size;
  const debug = await graph<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>("debug_token", `${app.id}|${app.secret}`, { input_token: userToken }).catch(() => null);
  const targets = new Set<string>();
  for (const g of debug?.data?.granular_scopes ?? []) if (PAGE_SCOPES.has(g.scope)) for (const id of g.target_ids ?? []) targets.add(id);
  for (const id of Array.from(targets)) {
    if (pages.get(id)?.access_token || !/^\d+$/.test(id)) continue;
    const p = await graph<MetaPage>(id, userToken, { fields: "id,name,access_token" }).catch(() => null);
    pages.set(id, { id, name: p?.name ?? pages.get(id)?.name ?? id, access_token: p?.access_token });
  }
  const list = Array.from(pages.values()).filter((p) => /^\d+$/.test(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  // No tokens or names — just enough to tell "nothing granted" from "no page tokens" in the logs.
  console.info("[meta-leads] pages", { accounts: fromAccounts, granularTargets: targets.size, listed: list.length, withToken: list.filter((p) => p.access_token).length });
  return list;
}

/* The user token waits for the page choice in an encrypted, httpOnly cookie. */
export const META_PICK_COOKIE = "meta_pick";
export const META_PICK_TTL_SEC = 900;
interface PickState {
  t: string; // long-lived user token
  c: string; // partner (client) id
  u: string; // TyloHQ user who signed in
  exp: number;
}
const pickKey = (secret: string) => createHash("sha256").update(`meta-pick:${secret}`).digest();

export function sealMetaPick(state: Omit<PickState, "exp">, now = Date.now()) {
  const app = metaApp();
  if (!app) throw new Error("not_configured");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", pickKey(app.secret), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...state, exp: now + META_PICK_TTL_SEC * 1000 }), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** The sealed state, or null when missing, tampered with, expired or not for this user/partner. */
export function openMetaPick(value: string | undefined, expect: { userId: string; clientId: string }, now = Date.now()): PickState | null {
  const app = metaApp();
  if (!app || !value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const d = createDecipheriv("aes-256-gcm", pickKey(app.secret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const s = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8")) as PickState;
    return s.exp > now && s.u === expect.userId && s.c === expect.clientId && typeof s.t === "string" ? s : null;
  } catch {
    return null;
  }
}

/**
 * Connect the chosen pages (ids from listMetaPages) to a partner: lead source
 * with the page token + webhook subscription, then a first pull of recent
 * leads. Returns how many pages were connected.
 */
export async function connectMetaPages(admin: SupabaseClient, opts: { userToken: string; pageIds: string[]; clientId: string; userId: string }) {
  const wanted = new Set(opts.pageIds);
  // Page tokens derived from a long-lived user token don't expire.
  const pages = (await listMetaPages(opts.userToken)).filter((p) => wanted.has(p.id));
  let connected = 0;
  for (const p of pages) {
    if (!p.access_token) continue;
    let status: "active" | "error" = "active";
    let lastError: string | null = null;
    try {
      await graph(`${p.id}/subscribed_apps`, p.access_token, { subscribed_fields: "leadgen" }, "POST");
    } catch (e) {
      status = "error";
      lastError = `Webhook: ${(e as Error).message}`.slice(0, 300);
    }
    const { error } = await admin.from("lead_sources").upsert(
      { client_id: opts.clientId, kind: "meta", label: p.name.slice(0, 120), external_id: p.id, access_token: p.access_token, status, last_error: lastError, created_by: opts.userId },
      { onConflict: "client_id,kind,external_id" },
    );
    if (!error) connected++;
  }
  if (connected) await syncMetaLeads(admin, { clientId: opts.clientId, days: 90 }).catch(() => {});
  return connected;
}

const LEAD_FIELDS = "id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic";

interface MetaLead {
  id: string;
  created_time: string;
  field_data?: { name: string; values?: string[] }[];
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
}

async function storeMetaLead(admin: SupabaseClient, source: { id: string; client_id: string }, l: MetaLead, formName: string | null, notify: boolean) {
  const fields: LeadField[] = (l.field_data ?? []).map((f) => ({ label: f.name, value: (f.values ?? []).join(", ") }));
  return ingestLead(admin, {
    clientId: source.client_id,
    source: "meta",
    sourceId: source.id,
    externalId: l.id,
    createdAt: l.created_time,
    fields,
    campaign: l.campaign_name ?? (l.is_organic ? "Organisch" : null),
    adGroup: l.adset_name ?? null,
    ad: l.ad_name ?? null,
    form: formName ?? (l.form_id ? `Formular ${l.form_id}` : null),
    platform: l.platform === "ig" ? "instagram" : l.platform === "fb" ? "facebook" : l.platform ?? "facebook",
    // Meta's Lead Ads Testing Tool fills every answer with "<test lead: dummy data for …>".
    isTest: fields.some((f) => /^<test lead/i.test(f.value)),
    notify,
  });
}

/** Webhook: one leadgen event → fetch the full lead with the page token → store it. */
export async function handleLeadgenEvent(admin: SupabaseClient, ev: { leadgen_id?: string; page_id?: string; form_id?: string }) {
  if (!ev.leadgen_id || !ev.page_id) return 0;
  const { data: sources } = await admin.from("lead_sources").select("id,client_id,access_token").eq("kind", "meta").eq("external_id", ev.page_id).neq("status", "disconnected");
  let stored = 0;
  for (const s of sources ?? []) {
    if (!s.access_token) continue;
    try {
      const lead = await graph<MetaLead>(ev.leadgen_id, s.access_token, { fields: LEAD_FIELDS });
      const form = lead.form_id ? await graph<{ name?: string }>(lead.form_id, s.access_token, { fields: "name" }).catch(() => ({ name: undefined })) : { name: undefined };
      const res = await storeMetaLead(admin, s, lead, form.name ?? null, true);
      if (!("error" in res) && !res.duplicate) stored++;
    } catch (e) {
      await admin.from("lead_sources").update({ status: "error", last_error: (e as Error).message.slice(0, 300) }).eq("id", s.id);
    }
  }
  return stored;
}

/**
 * Pull recent leads from every lead form of a partner's Meta pages (or all
 * partners when clientId is omitted). New ones notify only when `notify`.
 */
export interface MetaSyncOptions {
  clientId?: string;
  days?: number;
  notify?: boolean;
  /** Poll mode: look back only this far past the last sync (default: one day). */
  overlapMinutes?: number;
  /** Poll mode: skip archived/draft forms (they can't receive leads) to save Graph calls. */
  activeFormsOnly?: boolean;
  /** Alert only for leads younger than this — older ones are stored silently. */
  notifyMaxAgeMinutes?: number;
  /**
   * Skip a page synced more recently than this. Lets the poll run every few
   * seconds for sheets while each Meta page is still asked about once a minute
   * (Meta throttles pages that are polled harder).
   */
  minIntervalMs?: number;
}

interface MetaSourceConfig {
  /** Don't call Meta for this page before this time (rate limited). */
  retryAt?: string;
  rateLimitHits?: number;
  [k: string]: unknown;
}

export async function syncMetaLeads(admin: SupabaseClient, opts: MetaSyncOptions = {}) {
  let q = admin.from("lead_sources").select("id,client_id,access_token,external_id,last_synced_at,config").eq("kind", "meta").neq("status", "disconnected");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data: sources } = await q;
  // Pages are independent: sync them side by side, so one busy page doesn't
  // hold up the leads of the others.
  const counts = await Promise.all((sources ?? []).map((s) => syncMetaSource(admin, s, opts)));
  return counts.reduce((a, b) => a + b, 0);
}

type MetaSourceRow = { id: string; client_id: string; access_token: string | null; external_id: string | null; last_synced_at: string | null; config: unknown };

async function syncMetaSource(admin: SupabaseClient, s: MetaSourceRow, opts: MetaSyncOptions): Promise<number> {
  let added = 0;
  {
    if (!s.access_token || !s.external_id) return 0;
    // Throttled by Meta: wait it out (calling anyway extends the block). The
    // window below starts from the last good sync, so nothing is missed.
    const cfg = (s.config ?? {}) as MetaSourceConfig;
    if (cfg.retryAt && Date.parse(cfg.retryAt) > Date.now()) return 0;
    if (opts.minIntervalMs && s.last_synced_at && Date.now() - Date.parse(s.last_synced_at) < opts.minIntervalMs) return 0;
    const overlapMs = (opts.overlapMinutes ?? 24 * 60) * 60_000;
    const since = s.last_synced_at && !opts.days ? new Date(new Date(s.last_synced_at).getTime() - overlapMs) : new Date(Date.now() - (opts.days ?? 30) * 86_400_000);
    // Stamped at the start: a lead arriving mid-sync is inside the next window.
    const startedAt = new Date().toISOString();
    try {
      const forms = await graph<{ data: { id: string; name: string; status?: string }[] }>(`${s.external_id}/leadgen_forms`, s.access_token, { fields: "id,name,status", limit: "100" });
      for (const f of forms.data.filter((x) => !opts.activeFormsOnly || !x.status || x.status === "ACTIVE")) {
        let after: string | undefined;
        for (let page = 0; page < 10; page++) {
          const res = await graph<{ data: MetaLead[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${f.id}/leads`, s.access_token, {
            fields: LEAD_FIELDS,
            limit: "100",
            filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) }]),
            ...(after ? { after } : {}),
          });
          for (const l of res.data) {
            const fresh = !opts.notifyMaxAgeMinutes || Date.now() - new Date(l.created_time).getTime() <= opts.notifyMaxAgeMinutes * 60_000;
            const r = await storeMetaLead(admin, s, l, f.name, !!opts.notify && fresh);
            if (!("error" in r) && !r.duplicate) added++;
          }
          after = res.paging?.next ? res.paging.cursors?.after : undefined;
          if (!after) break;
        }
      }
      const { retryAt: _r, rateLimitHits: _h, ...rest } = cfg;
      await admin
        .from("lead_sources")
        .update({ last_synced_at: startedAt, status: "active", last_error: null, ...(cfg.retryAt || cfg.rateLimitHits ? { config: rest } : {}) })
        .eq("id", s.id);
    } catch (e) {
      if (isMetaRateLimit(e)) {
        // Not broken, just throttled: back off (Meta's estimate, else 2, 4, 8 … 60 min).
        const hits = (cfg.rateLimitHits ?? 0) + 1;
        const wait = Math.max((e as GraphError).regainMinutes ?? 0, Math.min(60, 2 ** hits));
        const retryAt = new Date(Date.now() + wait * 60_000).toISOString();
        await admin
          .from("lead_sources")
          .update({ status: "active", last_error: `Meta rate limit (#${(e as GraphError).code}), next try ${retryAt}`, config: { ...cfg, retryAt, rateLimitHits: hits } })
          .eq("id", s.id);
      } else {
        await admin.from("lead_sources").update({ status: "error", last_error: (e as Error).message.slice(0, 300) }).eq("id", s.id);
      }
    }
  }
  return added;
}
