import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { syncClient } from "@/lib/integrations/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Staff-only: run the daily sync for EVERY client right now — the same work the
 * 06:00 cron does, on demand (no CRON_SECRET exposed to the browser). Lets the
 * team test the pipeline and force a refresh without waiting for the schedule.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const rl = await getRateLimiter().limit(`syncall:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const { data: rows } = await admin.from("integrations").select("client_id").eq("status", "connected");
  const clientIds = Array.from(new Set((rows ?? []).map((r) => r.client_id).filter(Boolean))) as string[];

  // Three clients in parallel (same as the daily cron) so this stays inside the time limit.
  let totalSynced = 0;
  for (let i = 0; i < clientIds.length; i += 3) {
    const batch = await Promise.all(clientIds.slice(i, i + 3).map((id) => syncClient(admin, id, { auto: false, notify: false }).catch(() => ({ synced: 0 }))));
    totalSynced += batch.reduce((a, b) => a + b.synced, 0);
  }

  return NextResponse.json({ ok: true, clients: clientIds.length, totalSynced });
}
