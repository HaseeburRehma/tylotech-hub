import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGa4, fetchGoogleAds, fetchSearchConsole, isFetchError, type FetchResult } from "@/lib/integrations/fetchers";
import { fetchMetaAdsKpis } from "@/lib/integrations/meta-ads-adapter";
import { refreshGoogleAccessToken } from "@/lib/integrations/oauth";
import { notifyClientUsers } from "@/lib/notify";
import { CHANNEL_LABEL, emitActivity, joinDetail, leadsTitle } from "@/lib/live-feed";

const GOOGLE_PROVIDERS = new Set(["google_ads", "ga4", "search_console"]);
const AUTO_MIN_AGE_MS = 25 * 60 * 1000; // auto/cron skips rows synced < 25 min ago
const LEAD_PROVIDERS = new Set(["meta_ads", "google_ads"]);

/** Today's date in Germany (ad accounts report in local time). */
function todayBerlin() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Epoch ms of the most recent midnight in Germany. */
function berlinMidnight(now: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return now - ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
}

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
  // Archived clients are no longer synced.
  const { data: client } = await admin.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!client || client.archived_at) return { synced: 0, results: [] };

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
  const prevSyncAt: Record<string, string | null> = {};
  let populated = false;

  for (const row of rows) {
    if (opts.auto && row.last_synced_at && now - new Date(row.last_synced_at).getTime() < AUTO_MIN_AGE_MS) {
      results.push({ provider: row.provider, synced: false, reason: "recently synced" });
      continue;
    }

    const cfg = (row.meta ?? {}) as { accountId?: string; siteUrl?: string; propertyId?: string; [k: string]: unknown };

    // Google access tokens expire hourly → refresh from the stored refresh_token first.
    let accessToken: string | null = row.access_token;
    if (GOOGLE_PROVIDERS.has(row.provider) && row.refresh_token) {
      const fresh = await refreshGoogleAccessToken(row.refresh_token);
      if (fresh) {
        accessToken = fresh;
        await admin.from("integrations").update({ access_token: fresh }).eq("id", row.id);
      }
    }

    let data: FetchResult = null;
    if (row.provider === "meta_ads") data = await fetchMetaAdsKpis(accessToken ?? "", cfg.accountId ?? "");
    else if (row.provider === "google_ads") data = await fetchGoogleAds(accessToken ?? "", cfg.accountId ?? "");
    else if (row.provider === "ga4") data = await fetchGa4(accessToken ?? "", cfg.propertyId ?? "");
    else if (row.provider === "search_console") data = await fetchSearchConsole(accessToken ?? "", cfg.siteUrl ?? "");

    if (isFetchError(data)) {
      // A rejected token can't recover on its own — flag the integration so the
      // dashboards show "needs reconnect" instead of a stale "connected".
      const meta = { ...cfg, lastError: data.error, lastErrorAt: nowIso, lastErrorDetail: data.detail ?? null };
      await admin
        .from("integrations")
        .update(data.error === "auth" ? { status: "error", meta } : { meta })
        .eq("id", row.id);
      results.push({ provider: row.provider, synced: false, reason: data.error === "auth" ? "token rejected — reconnect" : "provider error" });
      continue;
    }
    if (!data) {
      results.push({ provider: row.provider, synced: false, reason: "no data (connect API / set account, or empty result)" });
      continue;
    }

    // Replace only this source's KPIs (preserves manual + other sources). Insert
    // the new set first and remove the old rows only once that succeeded.
    const source = data.kpis[0]?.source;
    if (source && data.kpis.length) {
      const { data: old } = await admin.from("kpis").select("id").eq("client_id", clientId).eq("source", source);
      const rowsToInsert = data.kpis.map((k) => ({ ...k, client_id: clientId }));
      let ins = await admin.from("kpis").insert(rowsToInsert);
      // Pre-0027 schema: delta is NOT NULL — store "no comparison" as 0 (the UI hides 0).
      if (ins.error?.code === "23502") ins = await admin.from("kpis").insert(rowsToInsert.map((k) => ({ ...k, delta: k.delta ?? 0 })));
      if (!ins.error && old?.length) await admin.from("kpis").delete().in("id", old.map((o: { id: string }) => o.id));
    }
    const byDate = (pointsByProviderDate[row.provider] = pointsByProviderDate[row.provider] || {});
    for (const p of data.series) {
      const cur = (byDate[p.date] = byDate[p.date] || { spend: 0, leads: 0, roas: 0 });
      cur.spend += p.spend;
      cur.leads += p.leads;
      if (p.roas) cur.roas = p.roas;
    }
    prevSyncAt[row.provider] = row.last_synced_at ?? null;
    const { lastError: _e, lastErrorAt: _a, lastErrorDetail: _d, ...cleanMeta } = cfg as Record<string, unknown>;
    await admin.from("integrations").update({ last_synced_at: nowIso, status: "connected", meta: cleanMeta }).eq("id", row.id);
    results.push({ provider: row.provider, synced: true, kpis: data.kpis.length });
    populated = true;
  }

  const points = Object.entries(pointsByProviderDate).flatMap(([provider, byDate]) =>
    Object.entries(byDate).map(([date, v]) => ({ client_id: clientId, date, provider, ...v })),
  );
  // Live feed (LIVE_FEED.md §4): remember today's stored lead totals before overwriting them.
  const today = todayBerlin();
  const leadPoints = points.filter((p) => LEAD_PROVIDERS.has(p.provider) && p.date === today);
  const previousLeads: Record<string, number> = {};
  if (leadPoints.length) {
    const { data: prev } = await admin
      .from("metric_points")
      .select("provider, leads")
      .eq("client_id", clientId)
      .eq("date", today)
      .in("provider", leadPoints.map((p) => p.provider));
    for (const r of prev ?? []) previousLeads[r.provider] = Number(r.leads) || 0;
  }

  if (points.length) await admin.from("metric_points").upsert(points, { onConflict: "client_id,date,provider" });

  // Emit only the increase since the last sync. The new total is part of the idempotency
  // key, so re-running a sync never creates a duplicate. The event time is placed inside
  // the window the leads actually arrived in (between the previous sync and now, today).
  for (const p of leadPoints) {
    const delta = p.leads - (previousLeads[p.provider] ?? 0);
    if (delta <= 0) continue;
    const midnight = berlinMidnight(now);
    const from = Math.max(midnight, prevSyncAt[p.provider] ? new Date(prevSyncAt[p.provider] as string).getTime() : midnight);
    const occurredAt = new Date(Math.min(now, from + Math.max(0, now - from) / 2));
    await emitActivity(admin, {
      clientId,
      kind: "leads",
      title: leadsTitle(delta),
      detail: joinDetail(CHANNEL_LABEL[p.provider], client.public_feed_label),
      occurredAt,
      source: p.provider as "meta_ads" | "google_ads",
      sourceRef: `metric_points:${clientId}:${today}:${p.provider}:leads=${p.leads}`,
    });
  }

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
