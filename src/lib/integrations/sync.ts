import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGa4, fetchGoogleAds, fetchSearchConsole, type FetchedData } from "@/lib/integrations/fetchers";
import { fetchMetaAdsKpis } from "@/lib/integrations/meta-ads-adapter";
import { refreshGoogleAccessToken } from "@/lib/integrations/oauth";
import { notifyClientUsers } from "@/lib/notify";

const GOOGLE_PROVIDERS = new Set(["google_ads", "ga4", "search_console"]);
const AUTO_MIN_AGE_MS = 25 * 60 * 1000; // auto/cron skips rows synced < 25 min ago

export interface SyncResult {
  provider: string;
  synced: boolean;
  reason?: string;
  kpis?: number;
}

/**
 * Pull live metrics for one client's connected integrations and write them into
 * kpis + metric_points. Shared by the interactive sync route and the daily cron.
 *
 * - `provider` limits to a single source.
 * - `auto` skips rows synced in the last 25 min (avoids API hammering on timers).
 * - `notify` (default true) posts the "fresh data" notification when data landed.
 *
 * Fetchers return null on no-token / bad-config / false-zero (200-but-empty), so
 * a failed source never overwrites good data with placeholders or silent zeros.
 */
export async function syncClient(
  admin: SupabaseClient,
  clientId: string,
  opts: { provider?: string; auto?: boolean; notify?: boolean } = {},
): Promise<{ synced: number; results: SyncResult[] }> {
  let query = admin
    .from("integrations")
    .select("id,provider,access_token,refresh_token,meta,last_synced_at")
    .eq("client_id", clientId)
    .eq("status", "connected");
  if (opts.provider) query = query.eq("provider", opts.provider);

  const { data: rows, error } = await query;
  if (error || !rows?.length) return { synced: 0, results: [] };

  const nowIso = new Date().toISOString();
  const now = Date.now();
  const results: SyncResult[] = [];
  // Keyed by provider so each source's daily numbers land in their own
  // metric_points rows instead of clobbering another source's row for the
  // same date (metric_points is unique on client_id, date, provider).
  const pointsByProviderDate: Record<string, Record<string, { spend: number; leads: number; roas: number }>> = {};
  let populated = false;

  for (const row of rows) {
    if (opts.auto && row.last_synced_at && now - new Date(row.last_synced_at).getTime() < AUTO_MIN_AGE_MS) {
      results.push({ provider: row.provider, synced: false, reason: "recently synced" });
      continue;
    }

    const cfg = (row.meta ?? {}) as { accountId?: string; siteUrl?: string; propertyId?: string };

    // Google access tokens expire hourly → refresh from the stored refresh_token first.
    let accessToken: string | null = row.access_token;
    if (GOOGLE_PROVIDERS.has(row.provider) && row.refresh_token) {
      const fresh = await refreshGoogleAccessToken(row.refresh_token);
      if (fresh) {
        accessToken = fresh;
        await admin.from("integrations").update({ access_token: fresh }).eq("id", row.id);
      }
    }

    let data: FetchedData | null = null;
    if (row.provider === "meta_ads") data = await fetchMetaAdsKpis(accessToken ?? "", cfg.accountId ?? "");
    else if (row.provider === "google_ads") data = await fetchGoogleAds(accessToken ?? "", cfg.accountId ?? "");
    else if (row.provider === "ga4") data = await fetchGa4(accessToken ?? "", cfg.propertyId ?? "");
    else if (row.provider === "search_console") data = await fetchSearchConsole(accessToken ?? "", cfg.siteUrl ?? "");

    if (!data) {
      results.push({ provider: row.provider, synced: false, reason: "no data (connect API / set account, or empty result)" });
      continue;
    }

    // Replace only this source's KPIs (preserves manual + other sources).
    const source = data.kpis[0]?.source;
    if (source) {
      await admin.from("kpis").delete().eq("client_id", clientId).eq("source", source);
      if (data.kpis.length) await admin.from("kpis").insert(data.kpis.map((k) => ({ ...k, client_id: clientId })));
    }
    const byDate = (pointsByProviderDate[row.provider] = pointsByProviderDate[row.provider] || {});
    for (const p of data.series) {
      const cur = (byDate[p.date] = byDate[p.date] || { spend: 0, leads: 0, roas: 0 });
      cur.spend += p.spend;
      cur.leads += p.leads;
      if (p.roas) cur.roas = p.roas;
    }
    await admin.from("integrations").update({ last_synced_at: nowIso, meta: cfg }).eq("id", row.id);
    results.push({ provider: row.provider, synced: true, kpis: data.kpis.length });
    populated = true;
  }

  const points = Object.entries(pointsByProviderDate).flatMap(([provider, byDate]) =>
    Object.entries(byDate).map(([date, v]) => ({ client_id: clientId, date, provider, ...v })),
  );
  if (points.length) await admin.from("metric_points").upsert(points, { onConflict: "client_id,date,provider" });

  if (populated && opts.notify !== false) {
    await notifyClientUsers(clientId, {
      title: "Fresh performance data is in",
      body: "Your latest campaign metrics have been synced.",
      href: "/dashboard",
      type: "update",
    });
  }

  return { synced: results.filter((r) => r.synced).length, results };
}
