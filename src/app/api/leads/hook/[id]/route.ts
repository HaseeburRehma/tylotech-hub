import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { UUID_RE, ingestLead, type LeadField } from "@/lib/leads";
import { normalizeLeadPayload } from "@/lib/lead-payload";
import { PROVIDER_BY_ID } from "@/lib/lead-providers";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};

/** Bigger bodies are not a lead form (uploads, abuse). */
const MAX_BODY = 256 * 1024;

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

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  const ctype = req.headers.get("content-type") ?? "";
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: Record<string, unknown> = {};
  if (ctype.includes("x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(text));
  else if (ctype.includes("multipart/form-data")) {
    const fd = await new Response(text, { headers: { "content-type": ctype } }).formData().catch(() => new FormData());
    body = Object.fromEntries(Array.from(fd.entries(), ([k, v]) => [k, typeof v === "string" ? v : v.name]));
  } else {
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: "Expected JSON or form data." }, { status: 400 });
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });

  const { data: src } = await admin.from("lead_sources").select("id,client_id,kind,secret,label,config").eq("id", params.id).maybeSingle();
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
    const provider = ((src.config ?? {}) as { provider?: string }).provider ?? "website";
    const n = normalizeLeadPayload(provider, body);
    fields = n.fields;
    if (!fields.length) return NextResponse.json({ error: "No lead fields in the request." }, { status: 400 });
    lead = {
      clientId: src.client_id,
      source: src.kind === "google_ads" ? "google_ads" : "webhook",
      sourceId: src.id,
      externalId: n.externalId,
      createdAt: n.createdAt,
      fields,
      campaign: n.campaign,
      form: n.form ?? src.label,
      platform: n.platform ?? PROVIDER_BY_ID.get(provider as never)?.platform ?? "website",
      isTest: n.isTest,
    };
  }

  const res = await ingestLead(admin, lead);
  if ("error" in res) {
    await admin.from("lead_sources").update({ status: "error", last_error: res.error.slice(0, 300) }).eq("id", src.id);
    return NextResponse.json({ error: "Could not store the lead." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, lead_no: res.lead_no, duplicate: !!res.duplicate });
}
