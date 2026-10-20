import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { UUID_RE, ingestLead, type LeadField } from "@/lib/leads";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Flatten a JSON payload into label/value pairs (two levels deep, arrays joined). */
function flatten(obj: Record<string, unknown>, prefix = "", depth = 0): LeadField[] {
  const out: LeadField[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === "") continue;
    const label = prefix ? `${prefix} ${k}` : k;
    if (Array.isArray(v)) out.push({ label, value: v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") });
    else if (typeof v === "object" && depth < 1) out.push(...flatten(v as Record<string, unknown>, label, depth + 1));
    else out.push({ label, value: typeof v === "object" ? JSON.stringify(v) : String(v) });
  }
  return out;
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};

// Keys that describe the lead, not answers from the person.
const META_KEYS = new Set(["key", "google_key", "api_version", "is_test", "lead_id", "id", "external_id", "form_id", "campaign_id", "adgroup_id", "creative_id", "gcl_id", "lead_submit_time", "submitted_at", "created_at", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "campaign", "form", "source", "platform"]);

/**
 * Receives leads for one source. Google Ads lead forms (Lead form → "Export
 * leads from Google Ads" → Webhook URL + key) and any website form, Zapier or
 * Make scenario posting JSON or form data. The key goes in ?key=, the
 * X-Lead-Key header, or the body (Google: google_key).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "Unknown source." }, { status: 404 });
  const rl = await getRateLimiter().limit(`lead-hook:${params.id}`, { limit: 120, windowSec: 60 });
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const ctype = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  if (ctype.includes("application/json")) body = ((await req.json().catch(() => null)) as Record<string, unknown>) ?? {};
  else if (ctype.includes("form")) body = Object.fromEntries((await req.formData().catch(() => new FormData())).entries()) as Record<string, unknown>;
  else body = ((await req.json().catch(() => null)) as Record<string, unknown>) ?? {};
  if (typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });

  const { data: src } = await admin.from("lead_sources").select("id,client_id,kind,secret,label").eq("id", params.id).maybeSingle();
  if (!src || src.kind === "meta" || !src.secret) return NextResponse.json({ error: "Unknown source." }, { status: 404 });
  const key = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-lead-key") ?? pick(body, "google_key", "key") ?? "";
  if (!same(key, src.secret)) return NextResponse.json({ error: "Invalid key." }, { status: 401 });

  let fields: LeadField[];
  let lead: Parameters<typeof ingestLead>[1];
  if (Array.isArray(body.user_column_data)) {
    // Google Ads lead form webhook.
    fields = (body.user_column_data as { column_name?: string; column_id?: string; string_value?: string }[])
      .map((c) => ({ label: c.column_name || c.column_id || "Feld", value: c.string_value ?? "" }))
      .filter((f) => f.value);
    lead = {
      clientId: src.client_id,
      source: "google_ads",
      sourceId: src.id,
      externalId: pick(body, "lead_id"),
      createdAt: pick(body, "lead_submit_time"),
      fields,
      campaign: pick(body, "campaign_name") ?? (pick(body, "campaign_id") ? `Kampagne ${pick(body, "campaign_id")}` : null),
      adGroup: pick(body, "adgroup_name") ?? pick(body, "adgroup_id"),
      ad: pick(body, "creative_id"),
      form: pick(body, "form_name") ?? (pick(body, "form_id") ? `Formular ${pick(body, "form_id")}` : null),
      platform: "google",
      isTest: body.is_test === true || body.is_test === "true",
    };
  } else {
    fields = flatten(Object.fromEntries(Object.entries(body).filter(([k]) => !META_KEYS.has(k.toLowerCase()))));
    if (!fields.length) return NextResponse.json({ error: "No lead fields in the request." }, { status: 400 });
    lead = {
      clientId: src.client_id,
      source: src.kind === "google_ads" ? "google_ads" : "webhook",
      sourceId: src.id,
      externalId: pick(body, "lead_id", "external_id", "id"),
      createdAt: pick(body, "submitted_at", "created_at"),
      fields,
      campaign: pick(body, "campaign", "utm_campaign"),
      form: pick(body, "form") ?? src.label,
      platform: pick(body, "platform", "source", "utm_source") ?? "website",
      isTest: body.is_test === true || body.is_test === "true",
    };
  }

  const res = await ingestLead(admin, lead);
  if ("error" in res) {
    await admin.from("lead_sources").update({ status: "error", last_error: res.error.slice(0, 300) }).eq("id", src.id);
    return NextResponse.json({ error: "Could not store the lead." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead_no: res.lead_no, duplicate: !!res.duplicate });
}
