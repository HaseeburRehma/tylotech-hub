import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { inBackground } from "@/lib/background";
import { PROVIDER_BY_ID, TOKEN_PROVIDERS, WEBHOOK_PROVIDERS, type LeadProviderId } from "@/lib/lead-providers";
import { API_ERROR_TEXT, ApiError, googleAdsAccess, syncApiLeadSources, verifyHubspot, verifyPipedrive } from "@/lib/lead-sync-api";
import { LEADS_NOT_READY, bad, leadsContext, missingLeads, sourceView } from "@/lib/leads";
import { getRateLimiter } from "@/lib/rate-limit";

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

/**
 * Add a source: { clientId? (team), provider, token? }.
 *   webhook providers (Typeform, Tally, Zapier, …)  → private URL + key
 *   hubspot / pipedrive + token                     → token checked, then fetched every minute
 *   google_ads                                      → the partner's connected Google Ads account
 * Older callers send { kind: "google_ads" | "webhook" } (= Google Ads webhook / website).
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { clientId?: string; kind?: string; provider?: string; token?: string; label?: string } | null;
  const ctx = await leadsContext(b?.clientId ?? null);
  if ("error" in ctx) return ctx.error;
  const rl = await getRateLimiter().limit(`lead-source:${ctx.user.id}`, { limit: 30, windowSec: 3600 });
  if (!rl.success) return bad("Too many attempts. Try again later.", 429);

  const provider = (b?.provider ?? (b?.kind === "google_ads" ? "google_ads_form" : b?.kind === "webhook" ? "website" : "")) as LeadProviderId;
  const def = PROVIDER_BY_ID.get(provider);
  if (!def || def.connect === "meta" || def.connect === "sheet") return bad("Unknown provider.");
  const origin = new URL(req.url).origin;
  const done = async (data: Record<string, unknown>, summary: string) => {
    await logAudit(ctx.user, { action: "lead_source.create", clientId: ctx.clientId, targetType: "lead_source", targetId: String(data.id), summary }, ctx.admin);
    return NextResponse.json({ ok: true, source: view(origin, data) });
  };

  if (WEBHOOK_PROVIDERS.has(provider)) {
    const label = String(b?.label ?? "").trim().slice(0, 120) || (provider === "google_ads_form" ? "Google Ads Lead-Formular" : provider === "website" ? "Website / API" : def.name);
    const { data, error } = await ctx.admin
      .from("lead_sources")
      .insert({
        client_id: ctx.clientId,
        kind: provider === "google_ads_form" ? "google_ads" : "webhook",
        label,
        secret: randomBytes(18).toString("base64url"),
        created_by: ctx.user.id,
        config: { provider },
      })
      .select("*")
      .single();
    if (error || !data) return missingLeads(error?.message) ? bad(LEADS_NOT_READY, 503) : bad("Could not create the source.");
    return done(data, `${provider}: ${label}`);
  }

  if (TOKEN_PROVIDERS.has(provider)) {
    const token = String(b?.token ?? "").trim();
    if (token.length < 10 || token.length > 500 || /\s/.test(token)) return bad("That doesn't look like an access token.");
    let account: string;
    try {
      account = (provider === "hubspot" ? await verifyHubspot(token) : await verifyPipedrive(token)).account;
    } catch (e) {
      const st = e instanceof ApiError ? e.status : 0;
      return bad(st === 401 ? "The token was refused. Copy it again." : st === 403 ? "The token is missing the permission to read contacts." : "Could not reach the service. Try again.", 400);
    }
    const { data, error } = await ctx.admin
      .from("lead_sources")
      .insert({ client_id: ctx.clientId, kind: "webhook", label: `${def.name}: ${account}`.slice(0, 120), access_token: token, created_by: ctx.user.id, config: { provider, account } })
      .select("*")
      .single();
    if (error || !data) return bad("Could not create the source.");
    // First import (last 30 days, no alerts) right away instead of on the next tick.
    inBackground("lead-source-first-sync", () => syncApiLeadSources(ctx.admin, { sourceId: data.id }));
    return done(data, `${provider}: ${account}`);
  }

  // Google Ads through the partner's connected account.
  const access = await googleAdsAccess(ctx.admin, ctx.clientId);
  if ("error" in access) return NextResponse.json({ error: API_ERROR_TEXT[access.error] ?? access.error, code: access.error }, { status: 400 });
  const { data: existing } = await ctx.admin.from("lead_sources").select("*").eq("client_id", ctx.clientId).eq("kind", "google_ads").contains("config", { mode: "api" }).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, source: view(origin, existing) });
  const { data, error } = await ctx.admin
    .from("lead_sources")
    .insert({ client_id: ctx.clientId, kind: "google_ads", label: "Google Ads", created_by: ctx.user.id, config: { provider: "google_ads", mode: "api" } })
    .select("*")
    .single();
  if (error || !data) return bad("Could not create the source.");
  inBackground("lead-source-first-sync", () => syncApiLeadSources(ctx.admin, { sourceId: data.id }));
  return done(data, "google_ads: account");
}
