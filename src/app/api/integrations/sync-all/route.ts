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

  let totalSynced = 0;
  for (const clientId of clientIds) {
    const { synced } = await syncClient(admin, clientId, { auto: false, notify: false });
    totalSynced += synced;
  }

  return NextResponse.json({ ok: true, clients: clientIds.length, totalSynced });
}
