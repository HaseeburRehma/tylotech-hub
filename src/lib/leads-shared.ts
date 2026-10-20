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
  kind: "meta" | "google_ads" | "webhook";
  label: string;
  status: "active" | "error" | "disconnected";
  last_error: string | null;
  last_received_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  hookUrl?: string | null;
  key?: string | null;
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
