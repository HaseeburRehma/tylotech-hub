import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { LEADS_NOT_READY, bad, leadsContext, missingLeads, sourceView } from "@/lib/leads";

export const runtime = "nodejs";

const view = sourceView;

/** Lead sources of a partner (team: ?clientId=). Tokens never leave the server. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await leadsContext(url.searchParams.get("clientId"));
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.admin.from("lead_sources").select("*").eq("client_id", ctx.clientId).order("created_at");
  if (error) return missingLeads(error.message) ? NextResponse.json({ sources: [], unavailable: true }) : bad("Could not load sources.");
  return NextResponse.json({ sources: (data ?? []).map((s) => view(url.origin, s)) });
}

/** Create a webhook source: { clientId? (team), kind: "google_ads" | "webhook", label? } → URL + key. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { clientId?: string; kind?: string; label?: string } | null;
  const ctx = await leadsContext(b?.clientId ?? null);
  if ("error" in ctx) return ctx.error;
  const kind = b?.kind === "google_ads" ? "google_ads" : b?.kind === "webhook" ? "webhook" : null;
  if (!kind) return bad("kind must be google_ads or webhook.");
  const label = String(b?.label ?? "").trim().slice(0, 120) || (kind === "google_ads" ? "Google Ads Lead-Formular" : "Website / Zapier");
  const { data, error } = await ctx.admin
    .from("lead_sources")
    .insert({ client_id: ctx.clientId, kind, label, secret: randomBytes(18).toString("base64url"), created_by: ctx.user.id })
    .select("*")
    .single();
  if (error || !data) return missingLeads(error?.message) ? bad(LEADS_NOT_READY, 503) : bad("Could not create the source.");
  await logAudit(ctx.user, { action: "lead_source.create", clientId: ctx.clientId, targetType: "lead_source", targetId: data.id, summary: `${kind}: ${label}` }, ctx.admin);
  return NextResponse.json({ ok: true, source: view(new URL(req.url).origin, data) });
}
