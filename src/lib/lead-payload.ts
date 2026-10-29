import { prettyLabel, type LeadField } from "@/lib/leads-shared";

/**
 * Turns what a form tool posts to a lead webhook into answers + lead details.
 * Typeform, Tally and Jotform have their own shapes; everything else (Heyflow,
 * Perspective, Webflow, Elementor, WPForms, Contact Form 7, Zapier, Make,
 * custom sites) goes through one reader that understands the common patterns:
 * flat key/value, `{label, value}` lists, `{title, value}` maps, envelopes like
 * `payload.data`, and PHP-style `fields[email][value]` form posts.
 */
export interface NormalizedLead {
  fields: LeadField[];
  externalId: string | null;
  createdAt: string | null;
  campaign: string | null;
  form: string | null;
  platform: string | null;
  isTest: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (v == null ? "" : typeof v === "string" ? v.trim() : typeof v === "number" || typeof v === "boolean" ? String(v) : "");
const MAX_FIELDS = 80;

/** Keys about the request, not answers from the person. Never stored as answers. */
const META_KEYS = new Set([
  "key", "google_key", "api_key", "apikey", "token", "secret", "password", "signature", "api_version", "is_test", "test",
  "lead_id", "id", "_id", "external_id", "submission_id", "submissionid", "response_id", "responseid", "entry_id", "event_id", "eventid",
  "form_id", "formid", "flowid", "flow_id", "site", "siteid", "site_id", "campaign_id", "adgroup_id", "creative_id", "gcl_id",
  "lead_submit_time", "submitted_at", "submittedat", "created_at", "createdat", "date_created", "timestamp", "d",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "campaign", "form", "form_name", "formname", "formtitle", "form_title",
  "source", "platform", "eventtype", "event_type", "triggertype", "trigger_type", "workspaceid",
  // Visitor tracking that doesn't belong in a lead (privacy): IPs, browsers, raw server data.
  "meta", "_meta", "rawrequest", "server", "user_agent", "useragent", "remote_ip", "ip", "ip_address", "ipaddress", "referer", "referrer_url", "page_url_raw",
]);
/** Objects that only wrap the answers: their keys are the answers. */
const CONTAINERS = new Set(["data", "fields", "answers", "values", "form_fields", "formdata", "form_data", "contact", "lead", "profile", "submission", "response", "properties", "custom_fields", "payload", "inputs", "entries"]);
const LABEL_KEYS = ["label", "title", "question", "question_text", "fieldlabel", "field_label", "name", "key", "field"];
const VALUE_KEYS = ["value", "answer", "text", "values", "response", "raw_value"];

const NAME_PARTS = new Set(["first", "last", "middle", "prefix", "suffix", "first_name", "last_name", "firstname", "lastname"]);
const norm = (k: string) => k.toLowerCase().replace(/[\s-]+/g, "_");

/** "fields[email][value]" → { fields: { email: { value } } } (Elementor, WordPress, PHP forms). */
export function unflattenBrackets(obj: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(obj)) {
    const parts = k.match(/^([^[\]]+)((?:\[[^[\]]*\])+)$/);
    if (!parts) {
      out[k] = v;
      continue;
    }
    const path = [parts[1], ...Array.from(parts[2].matchAll(/\[([^[\]]*)\]/g), (m) => m[1])];
    // Never walk into the object machinery (prototype pollution from a crafted form post).
    if (path.some((p) => p === "__proto__" || p === "constructor" || p === "prototype")) continue;
    let cur: Obj = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) cur[p] = v;
      else {
        if (!isObj(cur[p])) cur[p] = {};
        cur = cur[p] as Obj;
      }
    });
  }
  return out;
}

const valueText = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(", ");
  if (isObj(v)) {
    const inner = VALUE_KEYS.map((k) => v[k]).find((x) => x != null && x !== "");
    if (inner !== undefined) return valueText(inner);
    // Name parts and similar: "Erika Muster".
    const parts = Object.values(v).map(str).filter(Boolean);
    return parts.join(" ");
  }
  return str(v);
};

/** A `{label, value}`-like object → [label, value], else null. */
function pairOf(o: Obj): [string, string] | null {
  const keys = Object.keys(o).map(norm);
  const lk = LABEL_KEYS.find((k) => keys.includes(k) && typeof o[Object.keys(o)[keys.indexOf(k)]] === "string");
  const vk = VALUE_KEYS.find((k) => keys.includes(k));
  if (!lk || !vk) return null;
  const label = str(o[Object.keys(o)[keys.indexOf(lk)]]);
  const value = valueText(o[Object.keys(o)[keys.indexOf(vk)]]);
  return label ? [label, value] : null;
}

function collect(obj: Obj, out: LeadField[], prefix = "", depth = 0) {
  // Next to a block of answers ({ name: "Kontakt", data: {...} }), a plain
  // name/title names the form, not the person.
  const wrapsAnswers = Object.entries(obj).some(([k, v]) => CONTAINERS.has(norm(k)) && (isObj(v) || Array.isArray(v)));
  for (const [k, v] of Object.entries(obj)) {
    if (out.length >= MAX_FIELDS) return;
    if (v == null || v === "") continue;
    if (META_KEYS.has(norm(k))) continue;
    if (wrapsAnswers && ["name", "title"].includes(norm(k)) && typeof v === "string") continue;
    const label = prefix ? `${prefix} ${k}` : k;
    if (Array.isArray(v)) {
      if (v.length && v.every(isObj)) {
        const pairs = v.map((x) => pairOf(x as Obj));
        if (pairs.every(Boolean)) {
          for (const p of pairs as [string, string][]) if (p[1]) out.push({ label: p[0], value: p[1] });
          continue;
        }
      }
      const joined = valueText(v);
      if (joined) out.push({ label, value: joined });
      continue;
    }
    if (isObj(v)) {
      // { first: "Lena", last: "Beispiel" } (Jotform, Gravity Forms): one answer.
      const keys = Object.keys(v).map(norm);
      if (keys.length && keys.every((x) => NAME_PARTS.has(x)) && Object.values(v).every((x) => typeof x === "string")) {
        const t = valueText(v);
        if (t) out.push({ label, value: t });
        continue;
      }
      const pair = pairOf(v);
      if (pair) {
        if (pair[1]) out.push({ label: pair[0] || label, value: pair[1] });
        continue;
      }
      if (CONTAINERS.has(norm(k)) && depth < 3) collect(v, out, prefix, depth + 1);
      else if (depth < 2) collect(v, out, label, depth + 1);
      else {
        const t = valueText(v);
        if (t) out.push({ label, value: t });
      }
      continue;
    }
    const t = str(v);
    if (t) out.push({ label, value: t });
  }
}

/** First non-empty string among keys, searched in the body and its envelopes. */
function pick(scopes: Obj[], ...keys: string[]): string | null {
  for (const s of scopes) {
    for (const [k, v] of Object.entries(s)) {
      if (keys.includes(norm(k))) {
        const t = str(v);
        if (t) return t;
      }
    }
  }
  return null;
}

const envelopes = (body: Obj): Obj[] => {
  const out = [body];
  for (const k of ["payload", "data", "form_response", "submission", "lead", "response"]) {
    const v = body[k];
    if (isObj(v)) out.push(v, ...(isObj(v.data) ? [v.data as Obj] : []));
  }
  if (isObj(body.form)) out.push(body.form as Obj);
  return out;
};

const tidy = (fields: LeadField[]): LeadField[] => {
  const seen = new Set<string>();
  const out: LeadField[] = [];
  for (const f of fields) {
    const label = prettyLabel(f.label.replace(/^q\d+_/, "").trim()).slice(0, 200) || "Feld";
    const value = f.value.slice(0, 4000);
    const k = `${label}\u0000${value}`;
    if (!value || seen.has(k)) continue;
    seen.add(k);
    out.push({ label, value });
  }
  return out.slice(0, MAX_FIELDS);
};

const isTestFlag = (scopes: Obj[]) => scopes.some((s) => s.is_test === true || s.is_test === "true" || s.test === true || s.test === "true");

/** Typeform webhook: answers point to question ids; titles live in the form definition. */
function typeform(body: Obj): NormalizedLead | null {
  const r = body.form_response;
  if (!isObj(r) || !Array.isArray(r.answers)) return null;
  const def = isObj(r.definition) ? r.definition : {};
  const titles = new Map<string, string>(
    (Array.isArray(def.fields) ? def.fields : []).filter(isObj).map((f) => [str(f.id), str(f.title)] as [string, string]),
  );
  const fields: LeadField[] = [];
  for (const a of r.answers.filter(isObj)) {
    const field = isObj(a.field) ? a.field : {};
    const label = titles.get(str(field.id)) || str(field.ref) || "Antwort";
    const type = str(a.type);
    const v =
      type === "choice" && isObj(a.choice) ? str(a.choice.label) || str(a.choice.other)
      : type === "choices" && isObj(a.choices) ? [...(Array.isArray(a.choices.labels) ? a.choices.labels.map(str) : []), str(a.choices.other)].filter(Boolean).join(", ")
      : type === "payment" && isObj(a.payment) ? `${str(a.payment.amount)} (${str(a.payment.name)})`
      : valueText(a[type] ?? a.text ?? a.email ?? a.phone_number);
    if (v) fields.push({ label, value: v });
  }
  const hidden = isObj(r.hidden) ? r.hidden : {};
  for (const [k, v] of Object.entries(hidden)) if (!/^utm_/.test(k) && str(v)) fields.push({ label: k, value: str(v) });
  return {
    fields: tidy(fields),
    externalId: str(r.token) || str(body.event_id) || null,
    createdAt: str(r.submitted_at) || null,
    campaign: str(hidden.utm_campaign) || null,
    form: str(def.title) || null,
    platform: str(hidden.utm_source) || "typeform",
    isTest: false,
  };
}

/** Tally webhook: choice answers are option ids, resolved through `options`. */
function tally(body: Obj): NormalizedLead | null {
  const d = body.data;
  if (!isObj(d) || !Array.isArray(d.fields) || !/FORM_RESPONSE/i.test(str(body.eventType) || "FORM_RESPONSE")) return null;
  const fields: LeadField[] = [];
  for (const f of d.fields.filter(isObj)) {
    const opts = new Map<string, string>((Array.isArray(f.options) ? f.options : []).filter(isObj).map((o) => [str(o.id), str(o.text)] as [string, string]));
    const raw = f.value;
    const v = Array.isArray(raw) ? raw.map((x) => opts.get(str(x)) ?? valueText(x)).filter(Boolean).join(", ") : opts.get(str(raw)) ?? valueText(raw);
    if (v) fields.push({ label: str(f.label) || str(f.key) || "Feld", value: v });
  }
  const utm = (k: string) => (d.fields as unknown[]).filter(isObj).find((f) => norm(str(f.label)) === k);
  return {
    fields: tidy(fields.filter((f) => !/^utm_/i.test(norm(f.label)))),
    externalId: str(d.responseId) || str(d.submissionId) || str(body.eventId) || null,
    createdAt: str(d.createdAt) || str(body.createdAt) || null,
    campaign: str(utm("utm_campaign")?.value) || null,
    form: str(d.formName) || null,
    platform: str(utm("utm_source")?.value) || "tally",
    isTest: false,
  };
}

/** Jotform webhook: the answers come as a JSON string in `rawRequest`. */
function jotform(body: Obj): NormalizedLead | null {
  if (typeof body.rawRequest !== "string") return null;
  let raw: Obj;
  try {
    raw = JSON.parse(body.rawRequest) as Obj;
  } catch {
    return null;
  }
  const fields: LeadField[] = [];
  collect(Object.fromEntries(Object.entries(raw).filter(([k]) => /^q\d+_/.test(k))), fields);
  return {
    fields: tidy(fields),
    externalId: str(body.submissionID) || null,
    createdAt: null,
    campaign: null,
    form: str(body.formTitle) || null,
    platform: "jotform",
    isTest: false,
  };
}

/** Any webhook body → normalized lead. `provider` picks a dedicated reader when there is one. */
export function normalizeLeadPayload(provider: string | null | undefined, input: Obj): NormalizedLead {
  const body = unflattenBrackets(input);
  const special = (provider === "typeform" || isObj(body.form_response) ? typeform(body) : null) ?? (provider === "tally" || (isObj(body.data) && Array.isArray((body.data as Obj).fields)) ? tally(body) : null) ?? (provider === "jotform" || typeof body.rawRequest === "string" ? jotform(body) : null);
  if (special && special.fields.length) return { ...special, isTest: special.isTest || isTestFlag([body]) };

  const scopes = envelopes(body);
  const fields: LeadField[] = [];
  collect(body, fields);
  return {
    fields: tidy(fields),
    externalId: pick(scopes, "lead_id", "submission_id", "submissionid", "response_id", "responseid", "entry_id", "external_id", "event_id", "id", "_id"),
    createdAt: pick(scopes, "submitted_at", "submittedat", "created_at", "createdat", "date_created", "timestamp"),
    campaign: pick(scopes, "utm_campaign", "campaign"),
    form:
      pick(scopes, "form_name", "formname", "form_title", "formtitle", "flow_name", "funnel_name", "funnel") ??
      (isObj(body.form) ? str((body.form as Obj).name) || null : typeof body.form === "string" ? str(body.form) : null) ??
      scopes.map((s) => (Object.keys(s).some((k) => CONTAINERS.has(norm(k)) && (isObj(s[k]) || Array.isArray(s[k]))) ? str(s.name) || str(s.title) : "")).find(Boolean) ??
      null,
    platform: pick(scopes, "platform", "utm_source", "source") ?? (provider && provider !== "website" ? provider : "website"),
    isTest: isTestFlag(scopes),
  };
}
