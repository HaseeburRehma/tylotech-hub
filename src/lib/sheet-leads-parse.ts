/**
 * Google Sheet rows → leads (pure, no I/O). Website forms often write each
 * enquiry into a sheet: one tab for finished leads, one that also keeps
 * half-filled forms ("Teil-Lead") and updates the row when the person
 * finishes, sometimes a separate tab per offer (e.g. a retreat application).
 * The same lead id may sit in several tabs; it becomes one lead.
 */
import { createHash } from "node:crypto";
import { pickContact, type LeadField } from "@/lib/leads-shared";

export type Cell = string | number | boolean | null | undefined;

export interface SheetLead {
  externalId: string;
  createdAt: string | null;
  fields: LeadField[];
  tags: string[];
  campaign: string | null;
  form: string | null;
  platform: string;
  contact: { name: string | null; email: string | null; phone: string | null };
  complete: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Columns that describe the submission (ids, click ids, pixel hashes, mail
// bookkeeping), not answers from the person.
const TRACKING = new Set(
  [
    "gclid", "gbraid", "wbraid", "fbclid", "fbp", "fbc", "mc", "msclkid", "ttclid",
    "eventid", "eventname", "eventsourceurl", "em", "ph", "fn", "ln", "clientuseragent", "useragent", "ip", "clientipaddress",
    "extid", "externalid", "leadid", "id",
    "utmsource", "utmmedium", "utmcampaign", "utmcontent", "utmterm",
    "anbewerbungensheet", "emailgesendet", "mailgesendet",
  ].map(norm),
);
const TIME_KEYS = ["zeitstempel", "datum", "timestamp", "date", "erstelltam", "createdat", "submittedat", "eingang"];
const STATUS_KEYS = ["status", "leadstatus"];
const FORM_KEYS = ["formular", "form", "formname"];

/** Offset (ms) of `tz` from UTC at instant `ts`. */
function tzOffset(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - ts;
}

/** Wall-clock time in `tz` → ISO instant (handles daylight saving). */
export function zonedToIso(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): string | null {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(guess)) return null;
  let ts = guess;
  try {
    ts = guess - tzOffset(guess, tz);
    ts = guess - tzOffset(ts, tz);
  } catch {
    /* unknown zone: treat as UTC */
  }
  return new Date(ts).toISOString();
}

/**
 * A sheet date cell → ISO. Sheets give numbers (serial days since 1899-12-30,
 * wall time of the sheet's zone) for real dates and strings for text such as
 * "27.10.2026, 09:16:39" or "2026-10-27 9:18:58".
 */
export function parseSheetDate(v: Cell, tz: string): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const wall = new Date(Math.round((v - 25569) * 86_400_000));
    return zonedToIso(wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate(), wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), tz);
  }
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return zonedToIso(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return zonedToIso(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
  // Has its own offset ("…Z", "+01:00").
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s))) return new Date(s).toISOString();
  return null;
}

const text = (v: Cell) => (v == null ? "" : typeof v === "number" ? String(v) : String(v).trim());

/** "https://site/page/?gad_source=1&gclid=…" → "https://site/page/" (click ids don't help sales). */
const stripQuery = (v: string) => (/^https?:\/\//i.test(v) ? v.split(/[?#]/)[0] : v);

/** Tab kind from its title: a retreat / application tab gets its own tag and form name. */
const isRetreat = (tab: string) => /retreat|bewerbung|application/i.test(tab);

/** Which column holds the lead id: a "LeadID"-like header, else an unnamed first column of unique ids. */
function idColumn(headers: string[], rows: Cell[][]): number {
  const named = headers.findIndex((h) => ["leadid", "extid", "externalid", "id"].includes(norm(h)));
  if (named >= 0 && rows.some((r) => text(r[named]))) return named;
  for (let c = 0; c < Math.min(headers.length, 3); c++) {
    if (norm(headers[c])) continue;
    const vals = rows.map((r) => text(r[c])).filter(Boolean);
    if (vals.length && vals.every((v) => /^[\w-]{8,}$/.test(v)) && new Set(vals).size === vals.length) return c;
  }
  return -1;
}

/** One tab → leads (one per row with any answer). */
export function tabToLeads(tab: string, values: Cell[][], tz: string): SheetLead[] {
  if (!values.length) return [];
  const headers = (values[0] ?? []).map((h) => text(h));
  const rows = values.slice(1);
  const idCol = idColumn(headers, rows);
  const col = (keys: string[]) => headers.findIndex((h) => keys.includes(norm(h)));
  const timeCol = col(TIME_KEYS);
  const statusCol = col(STATUS_KEYS);
  const formCol = col(FORM_KEYS);
  const at = (r: Cell[], key: string) => {
    const i = headers.findIndex((h) => norm(h) === key);
    return i >= 0 ? text(r[i]) : "";
  };
  const retreat = isRetreat(tab);
  // A tab whose status says how far people got ("Teil-Lead", "Vollständig")
  // keeps partial forms; any other lead tab only ever holds finished ones.
  const PROGRESS = /vollst|teil|partial|complete/i;
  const tracksProgress = statusCol >= 0 && rows.some((r) => PROGRESS.test(text(r[statusCol])));
  const out: SheetLead[] = [];

  for (const r of rows) {
    const fields: LeadField[] = [];
    headers.forEach((h, i) => {
      if (!h || i === idCol || i === timeCol || i === statusCol || i === formCol) return;
      const n = norm(h);
      if (TRACKING.has(n)) return;
      const v = stripQuery(text(r[i]));
      if (!v) return;
      fields.push({ label: h, value: v.slice(0, 4000) });
    });
    if (!fields.length) continue;

    const created = timeCol >= 0 ? parseSheetDate(r[timeCol], tz) : null;
    const status = statusCol >= 0 ? text(r[statusCol]) : "";
    const contact = pickContact(fields);
    // Without an id column: the same person at the same second is the same row.
    const externalId =
      (idCol >= 0 && text(r[idCol])) ||
      `sheet:${createHash("sha1").update(`${tab}|${created ?? ""}|${contact.email ?? ""}|${contact.phone ?? ""}`).digest("hex").slice(0, 20)}`;

    const tags: string[] = [];
    if (retreat) tags.push("Retreat");
    if (PROGRESS.test(status)) tags.push(status.slice(0, 40));
    else if (!retreat && !tracksProgress) tags.push("Vollständig");
    const complete = tags.some((t) => /vollst|complete/i.test(t));
    // Any other status (e.g. the team's own "abgeschlossen") stays visible as an answer.
    if (status && !PROGRESS.test(status)) fields.push({ label: "Status (Sheet)", value: status.slice(0, 200) });

    const gclid = at(r, "gclid") || at(r, "gbraid") || at(r, "wbraid");
    const fb = at(r, "fbclid") || at(r, "fbc");
    const utmSource = at(r, "utmsource");
    out.push({
      externalId: externalId.slice(0, 200),
      createdAt: created,
      fields,
      tags,
      campaign: at(r, "utmcampaign") || null,
      form: (formCol >= 0 && text(r[formCol])) || (retreat ? "Retreat-Bewerbung" : "Website-Formular"),
      platform: gclid ? "google" : fb ? "facebook" : utmSource ? utmSource.toLowerCase().slice(0, 60) : "website",
      contact,
      complete,
    });
  }
  return out;
}

/**
 * The same lead in several tabs (finished-leads tab + all-leads tab) → one
 * lead: answers merged (non-empty wins, first tab first), earliest time,
 * "Vollständig" replaces any "Teil…" tag, contact filled from whichever has it.
 */
export function mergeSheetLeads(lists: SheetLead[][]): SheetLead[] {
  const by = new Map<string, SheetLead>();
  for (const list of lists) {
    for (const l of list) {
      const prev = by.get(l.externalId);
      if (!prev) {
        by.set(l.externalId, { ...l, fields: [...l.fields], tags: [...l.tags] });
        continue;
      }
      for (const f of l.fields) {
        const i = prev.fields.findIndex((x) => norm(x.label) === norm(f.label));
        if (i < 0) prev.fields.push(f);
        else if (!prev.fields[i].value) prev.fields[i] = f;
      }
      for (const t of l.tags) if (!prev.tags.includes(t)) prev.tags.push(t);
      if (l.createdAt && (!prev.createdAt || l.createdAt < prev.createdAt)) prev.createdAt = l.createdAt;
      prev.campaign ??= l.campaign;
      if (prev.platform === "website" && l.platform !== "website") prev.platform = l.platform;
      prev.contact = {
        name: prev.contact.name ?? l.contact.name,
        email: prev.contact.email ?? l.contact.email,
        phone: prev.contact.phone ?? l.contact.phone,
      };
      prev.complete ||= l.complete;
    }
  }
  for (const l of Array.from(by.values())) {
    if (l.complete) l.tags = l.tags.filter((t) => !/teil|partial/i.test(t));
    if (l.complete && !l.tags.some((t) => /vollst|complete/i.test(t))) l.tags.push("Vollständig");
    l.fields = l.fields.slice(0, 80);
  }
  return Array.from(by.values());
}

/** Fingerprint of what the sales team sees, to skip rows that didn't change. */
export function leadFingerprint(l: SheetLead): string {
  return createHash("sha1")
    .update(JSON.stringify([l.fields, l.tags, l.createdAt, l.campaign, l.form, l.platform]))
    .digest("base64url")
    .slice(0, 16);
}

/** Spreadsheet id out of a pasted link (or the id itself). */
export function spreadsheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{30,}$/.test(s) ? s : null;
}

/** Header row looks like a lead list (has a phone or email column). */
export function looksLikeLeadTab(headers: Cell[]): boolean {
  return headers.some((h) => /mail|telefon|phone|handy|mobil/i.test(text(h)));
}
