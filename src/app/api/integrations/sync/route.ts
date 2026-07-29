import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { fetchMetaAds, fetchSearchConsole, type FetchedData } from "@/lib/integrations/fetchers";
import { notifyClientUsers } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`sync:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many sync requests." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; provider?: string };
  const clientId = user.role === "client" ? user.client_id : body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = createClient();
  if (!supabase) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  let query = supabase
    .from("integrations")
    .select("id,provider,access_token,meta")
    .eq("client_id", clientId)
    .eq("status", "connected");
  if (body.provider) query = query.eq("provider", body.provider);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ ok: true, synced: 0, results: [] });

  const nowIso = new Date().toISOString();
  const results: { provider: string; synced: boolean; reason?: string; kpis?: number }[] = [];
  let populated = false;

  for (const row of rows) {
    const cfg = (row.meta ?? {}) as { accountId?: string; siteUrl?: string };
    let data: FetchedData | null = null;

    if (row.provider === "meta_ads") {
      data = await fetchMetaAds(row.access_token, cfg.accountId ?? "");
    } else if (row.provider === "search_console" || row.provider === "ga4" || row.provider === "google_ads") {
      data = await fetchSearchConsole(row.access_token, cfg.siteUrl ?? "");
    }

    if (!data) {
      // No live credentials/config yet → write nothing (no placeholder data).
      results.push({ provider: row.provider, synced: false, reason: "Connect the API + set account/site to pull live data" });
      continue;
    }

    // Replace only this source's KPIs (preserves manually-entered + other sources).
    const source = data.kpis[0]?.source;
    if (source) {
      await supabase.from("kpis").delete().eq("client_id", clientId).eq("source", source);
      if (data.kpis.length) await supabase.from("kpis").insert(data.kpis.map((k) => ({ ...k, client_id: clientId })));
    }
    if (row.provider === "meta_ads" && data.series.length) {
      await supabase
        .from("metric_points")
        .upsert(data.series.map((p) => ({ client_id: clientId, ...p })), { onConflict: "client_id,date" });
    }
    await supabase.from("integrations").update({ last_synced_at: nowIso, meta: cfg }).eq("id", row.id);
    results.push({ provider: row.provider, synced: true, kpis: data.kpis.length });
    populated = true;
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
