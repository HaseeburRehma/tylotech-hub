import { NextResponse } from "next/server";
import { leadsContext } from "@/lib/leads";
import { refreshGoogleAccessToken } from "@/lib/integrations/oauth";
import { googleCampaignStats, metaCampaignStats, type StatsResult } from "@/lib/integrations/campaigns";
import type { CampaignStat } from "@/lib/campaign-classify";
import { getRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TTL_MS = 60_000;
// Per instance: changing filters back and forth shouldn't refetch Meta each time.
const cache = new Map<string, { at: number; body: unknown }>();

/**
 * Spend per campaign and ad for a partner and date range (team: ?clientId=;
 * ?from=&to= as Berlin days, both empty = all time). Tokens stay on the server.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await leadsContext(url.searchParams.get("clientId"));
  if ("error" in ctx) return ctx.error;
  const from = url.searchParams.get("from") || null;
  const to = url.searchParams.get("to") || null;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to)) || (!!from !== !!to) || (from && to && from > to)) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }
  const rl = await getRateLimiter().limit(`lead-campaigns:${ctx.user.id}`, { limit: 30, windowSec: 60 });
  if (!rl.success) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  const key = `${ctx.clientId}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);

  const { data: rows } = await ctx.admin
    .from("integrations")
    .select("provider,access_token,refresh_token,meta")
    .eq("client_id", ctx.clientId)
    .in("provider", ["meta_ads", "google_ads"])
    .eq("status", "connected");

  const jobs: Promise<{ provider: string; result: StatsResult }>[] = [];
  for (const r of (rows ?? []) as any[]) {
    const meta = (r.meta ?? {}) as { accountId?: string; loginCustomerId?: string };
    if (!meta.accountId) continue;
    if (r.provider === "meta_ads" && r.access_token) {
      jobs.push(metaCampaignStats(r.access_token, meta.accountId, from, to).then((result) => ({ provider: "meta_ads", result })));
    }
    if (r.provider === "google_ads" && r.refresh_token) {
      jobs.push(
        refreshGoogleAccessToken(r.refresh_token).then(async (tok) => ({
          provider: "google_ads",
          result: tok ? await googleCampaignStats(tok, meta.accountId!, meta.loginCustomerId, from, to) : ({ error: "Google sign-in expired. Reconnect Google Ads." } as StatsResult),
        })),
      );
    }
  }
  const done = await Promise.all(jobs);
  const campaigns: CampaignStat[] = [];
  const errors: { provider: string; error: string }[] = [];
  let currency = "EUR";
  for (const d of done) {
    if ("error" in d.result) errors.push({ provider: d.provider, error: d.result.error.slice(0, 200) });
    else {
      campaigns.push(...d.result.campaigns);
      currency = d.result.currency || currency;
    }
  }
  const body = { from, to, currency, campaigns, errors, connected: done.map((d) => d.provider) };
  // Only cache complete answers; a failed platform is retried on the next request.
  if (!errors.length) cache.set(key, { at: Date.now(), body });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return NextResponse.json(body);
}
