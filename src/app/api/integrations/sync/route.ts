import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { fetchGa4, fetchGoogleAds, fetchMetaAds, fetchSearchConsole, type FetchedData } from "@/lib/integrations/fetchers";
import { refreshGoogleAccessToken } from "@/lib/integrations/oauth";
import { notifyClientUsers } from "@/lib/notify";

const GOOGLE_PROVIDERS = new Set(["google_ads", "ga4", "search_console"]);
const AUTO_MIN_AGE_MS = 25 * 60 * 1000; // auto-refresh skips rows synced < 25 min ago

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`sync:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many sync requests." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; provider?: string; auto?: boolean };
  const clientId = user.role === "client" ? user.client_id : body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Tokens (access_token/refresh_token) and KPI/metric writes go through the
  // service-role client: those columns are revoked from the browser role, and the
  // client's tenant ownership is already enforced above. This keeps secrets off
  // the user-scoped connection entirely.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  let query = admin
    .from("integrations")
    .select("id,provider,access_token,refresh_token,meta,last_synced_at")
    .eq("client_id", clientId)
    .eq("status", "connected");
  if (body.provider) query = query.eq("provider", body.provider);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ ok: true, synced: 0, results: [] });

  const nowIso = new Date().toISOString();
  const now = Date.now();
  const results: { provider: string; synced: boolean; reason?: string; kpis?: number }[] = [];
  const pointsByDate: Record<string, { spend: number; leads: number; roas: number }> = {};
  let populated = false;

  for (const row of rows) {
    // Auto (30-min timer) skips sources refreshed very recently to avoid API hammering.
    if (body.auto && row.last_synced_at && now - new Date(row.last_synced_at).getTime() < AUTO_MIN_AGE_MS) {
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
    if (row.provider === "meta_ads") data = await fetchMetaAds(accessToken ?? "", cfg.accountId ?? "");
    else if (row.provider === "google_ads") data = await fetchGoogleAds(accessToken ?? "", cfg.accountId ?? "");
    else if (row.provider === "ga4") data = await fetchGa4(accessToken ?? "", cfg.propertyId ?? "");
    else if (row.provider === "search_console") data = await fetchSearchConsole(accessToken ?? "", cfg.siteUrl ?? "");

    if (!data) {
      // No valid token / config yet → write nothing (no placeholder data).
      results.push({ provider: row.provider, synced: false, reason: "Connect the API (OAuth) + set account/site/property to pull live data" });
      continue;
    }

    // Replace only this source's KPIs (preserves manually-entered + other sources).
    const source = data.kpis[0]?.source;
    if (source) {
      await admin.from("kpis").delete().eq("client_id", clientId).eq("source", source);
      if (data.kpis.length) await admin.from("kpis").insert(data.kpis.map((k) => ({ ...k, client_id: clientId })));
    }
    // Merge every source's daily series into one point per date (schema = spend/leads/roas).
    for (const p of data.series) {
      const cur = (pointsByDate[p.date] = pointsByDate[p.date] || { spend: 0, leads: 0, roas: 0 });
      cur.spend += p.spend;
      cur.leads += p.leads;
      if (p.roas) cur.roas = p.roas;
    }
    await admin.from("integrations").update({ last_synced_at: nowIso, meta: cfg }).eq("id", row.id);
    results.push({ provider: row.provider, synced: true, kpis: data.kpis.length });
    populated = true;
  }

  // Persist the merged time-series so the dashboard chart shows real data.
  const points = Object.entries(pointsByDate).map(([date, v]) => ({ client_id: clientId, date, ...v }));
  if (points.length) {
    await admin.from("metric_points").upsert(points, { onConflict: "client_id,date" });
  }

  if (populated) {
    await notifyClientUsers(clientId, {
      title: "Fresh performance data is in",
      body: "Your latest campaign metrics have been synced.",
      href: "/dashboard",
      type: "update",
    });
  }

  return NextResponse.json({ ok: true, synced: results.filter((r) => r.synced).length, results });
}
