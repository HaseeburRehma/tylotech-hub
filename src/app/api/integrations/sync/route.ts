import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { getRateLimiter, ipKey, rateLimitHeaders } from "@/lib/rate-limit";
import { generateMetrics } from "@/lib/integrations/sync";
import type { ProviderId } from "@/lib/integrations/providers";

export const runtime = "nodejs";

const seedFrom = (s: string) =>
  Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0);

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`sync:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many sync requests." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
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
    .select("id,provider")
    .eq("client_id", clientId)
    .eq("status", "connected");
  if (body.provider) query = query.eq("provider", body.provider);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!rows?.length) {
    return NextResponse.json({ ok: true, synced: 0, results: [] });
  }

  const nowIso = new Date().toISOString();
  const results = [];
  for (const row of rows) {
    const metrics = generateMetrics(row.provider as ProviderId, seedFrom(clientId + row.provider));
    await supabase
      .from("integrations")
      .update({ last_synced_at: nowIso, meta: { metrics, syncedAt: nowIso } })
      .eq("id", row.id);
    results.push({ provider: row.provider, metrics });
  }

  // Refresh the client's daily performance series (last 30 days).
  const seed = seedFrom(clientId);
  const noise = (i: number) => Math.abs((Math.sin((seed + i) * 12.9898) * 43758.5453) % 1);
  const today = new Date();
  const points = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const base = 480 + Math.sin(i / 3) * 120 + i * 14;
    return {
      client_id: clientId,
      date: d.toISOString().slice(0, 10),
      spend: Math.round(base + noise(i) * 80),
      leads: Math.round(8 + Math.sin(i / 2) * 4 + i * 0.3 + noise(i + 7) * 3),
      roas: Number((3.4 + Math.sin(i / 4) * 0.8 + i * 0.02).toFixed(2)),
    };
  });
  await supabase.from("metric_points").upsert(points, { onConflict: "client_id,date" });

  return NextResponse.json({ ok: true, synced: results.length, results });
}
