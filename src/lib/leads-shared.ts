/**
 * Leads (migration 0043) — types and pure helpers, safe for client components.
 * Server-side ingest and access checks live in src/lib/leads.ts.
 */

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "not_reached",
  "appointment_set",
  "appointment_done",
  "offer_sent",
  "won",
  "lost",
  "invalid",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Statuses that still need work (the default "open" filter). */
export const OPEN_STATUSES: LeadStatus[] = ["new", "contacted", "not_reached", "appointment_set", "appointment_done", "offer_sent"];

export type LeadSource = "meta" | "google_ads" | "webhook" | "manual" | "import";

export interface LeadField {
  label: string;
  value: string;
}

export interface Lead {
  id: string;
  client_id: string;
  lead_no: number;
  source: LeadSource;
  source_id: string | null;
  external_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  campaign: string | null;
  ad_group: string | null;
  ad: string | null;
  form: string | null;
  platform: string | null;
  fields: LeadField[];
  status: LeadStatus;
  assigned_to: string | null;
  appointment_at: string | null;
  value: number | null;
  lost_reason: string | null;
  is_test: boolean;
  created_at: string;
  received_at: string;
  updated_at: string;
  last_activity_at: string;
  /** Speed-to-Lead (0046): who grabbed it, when, and when the first call started. */
  claimed_by?: string | null;
  claimed_at?: string | null;
  call_started_at?: string | null;
  /** Labels from the source, e.g. "Vollständig", "Teil-Lead", "Retreat" (0047). */
  tags?: string[];
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  client_id: string;
  user_id: string | null;
  kind: "created" | "status" | "assign" | "note" | "call" | "email" | "appointment" | "value" | "edit";
  body: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

/** A lead source as the UI sees it — never the token; the hook URL only for people who may manage sources. */
export interface LeadSourceView {
  id: string;
  kind: "meta" | "google_ads" | "webhook" | "google_sheet";
  label: string;
  status: "active" | "error" | "disconnected";
  last_error: string | null;
  last_received_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  hookUrl?: string | null;
  key?: string | null;
  /** Google Sheet sources: which tabs are read. */
  sheet?: { tabs: string[]; title: string | null };
}

export interface LeadPerson {
  id: string;
  name: string;
  title: string | null;
  role: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

const NAME_KEYS = ["fullname", "name", "vollername", "vollstandigername", "vorundnachname", "kontaktname", "ihrname", "dein name"].map(norm);
const FIRST_KEYS = ["firstname", "vorname", "givenname"];
const LAST_KEYS = ["lastname", "nachname", "familyname", "surname"];
const EMAIL_KEYS = ["email", "emailaddress", "emailadresse", "mail", "useremail", "ihreemail", "deineemail"];
const PHONE_KEYS = ["phone", "phonenumber", "telefon", "telefonnummer", "tel", "mobile", "mobil", "mobilnummer", "handy", "handynummer", "rufnummer", "whatsapp"];

/** Name, email and phone out of whatever fields a form sent (Meta, Google Ads, website). */
export function pickContact(fields: LeadField[]): { name: string | null; email: string | null; phone: string | null } {
  const by = (keys: string[]) => fields.find((f) => keys.includes(norm(f.label)) && f.value.trim())?.value.trim() ?? null;
  let name = by(NAME_KEYS);
  if (!name) {
    const first = by(FIRST_KEYS);
    const last = by(LAST_KEYS);
    name = [first, last].filter(Boolean).join(" ") || null;
  }
  let email = by(EMAIL_KEYS);
  if (!email) email = fields.find((f) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value.trim()))?.value.trim() ?? null;
  let phone = by(PHONE_KEYS);
  if (!phone) phone = fields.find((f) => /^\+?[\d\s()/-]{6,}$/.test(f.value.trim()) && /\d{6,}/.test(f.value.replace(/\D/g, "")))?.value.trim() ?? null;
  return { name: name?.slice(0, 200) ?? null, email: email?.slice(0, 320).toLowerCase() ?? null, phone: phone?.slice(0, 60) ?? null };
}

/** "full_name" → "Full name"; leaves human labels alone. */
export function prettyLabel(label: string) {
  if (!/[_]/.test(label) && /[A-Z ]/.test(label)) return label;
  const s = label.replace(/[_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Phone number for tel: / wa.me links (digits, leading + kept; German 0… → +49). */
export function dialable(phone: string, forWhatsApp = false) {
  let p = phone.replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  if (p.startsWith("0")) p = `+49${p.slice(1)}`;
  return forWhatsApp ? p.replace(/^\+/, "") : p;
}

/**
 * Leads that repeat an earlier lead's phone (last 9 digits, so +49 / 0049 / 0
 * spellings match) or email: lead id → lead number of the first one. Test
 * leads are ignored.
 */
export function findDuplicates(leads: Pick<Lead, "id" | "lead_no" | "phone" | "email" | "created_at" | "is_test">[]): Map<string, number> {
  const first = new Map<string, number>();
  const out = new Map<string, number>();
  const sorted = leads.filter((l) => !l.is_test).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.lead_no - b.lead_no);
  for (const l of sorted) {
    const digits = (l.phone ?? "").replace(/\D/g, "");
    const keys = [digits.length >= 8 ? `p:${digits.slice(-9)}` : null, l.email?.trim() ? `e:${l.email.trim().toLowerCase()}` : null].filter(Boolean) as string[];
    const hit = keys.map((k) => first.get(k)).find((n) => n != null);
    if (hit != null) out.set(l.id, hit);
    for (const k of keys) if (!first.has(k)) first.set(k, hit ?? l.lead_no);
  }
  return out;
}

/**
 * Does this person get an email for every new lead? Partner users: yes unless
 * they switched it off. TyloTech staff: only if they switched it on (push and
 * in-app alerts reach them anyway; an email per lead per person used up the
 * daily email quota). Stored as `lead_email` in the auth user's metadata.
 */
export function wantsLeadEmail(role: string, meta?: { lead_email?: unknown } | null): boolean {
  if (meta?.lead_email === true) return true;
  if (meta?.lead_email === false) return false;
  return role === "client";
}

