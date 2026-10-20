import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for an uptime monitor (e.g. Better Stack, UptimeRobot):
 * 200 when the app can reach the database within 3 s, 503 otherwise. Reveals
 * no configuration or data — only status, latency and the deployed commit.
 */
export async function GET() {
  const started = Date.now();
  const admin = createAdminClient();
  let db: { ok: boolean; ms: number } = { ok: false, ms: 0 };
  if (admin) {
    const probe = admin.from("clients").select("id", { head: true, count: "exact" }).limit(1);
    const timeout = new Promise<{ error: { message: string } }>((r) => setTimeout(() => r({ error: { message: "timeout" } }), 3000));
    const res = (await Promise.race([probe, timeout])) as { error: unknown };
    db = { ok: !res.error, ms: Date.now() - started };
  }
  const body = {
    status: db.ok ? "ok" : "degraded",
    db,
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    region: process.env.VERCEL_REGION ?? null,
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
