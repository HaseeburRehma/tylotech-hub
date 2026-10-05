import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { FEED_LIMIT, FEED_WINDOW_MS, serializePublicFeed, type ActivityRow } from "@/lib/live-feed";
import { getRateLimiter, ipKey, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/public/live-feed — real, opted-in activity of the last 24 h for the marketing
 * website's live bar (spec: LIVE_FEED.md). Server-to-server only: no CORS, token in the
 * Authorization header only (no ?key= fallback), compared in constant time.
 */
function tokenMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const expected = process.env.LIVE_FEED_TOKEN;
  if (!expected) return NextResponse.json({ error: "Backend not configured." }, { status: 503, headers: NO_STORE });

  const auth = req.headers.get("authorization") ?? "";
  const provided = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? "";
  if (!provided || !tokenMatches(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  const rl = await getRateLimiter().limit(`feed:${ipKey(req)}`, config.rateLimit.feed);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { ...NO_STORE, ...rateLimitHeaders(rl) } });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503, headers: NO_STORE });

  const { data, error } = await admin
    .from("activity_events")
    .select("id, kind, title, detail, occurred_at, clients!inner(public_feed_opt_in, archived_at)")
    .eq("hidden", false)
    .eq("clients.public_feed_opt_in", true)
    .is("clients.archived_at", null)
    .gt("occurred_at", new Date(Date.now() - FEED_WINDOW_MS).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(FEED_LIMIT);

  if (error) {
    console.error("live-feed:", error.message);
    return NextResponse.json({ error: "Feed unavailable." }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(
    { events: serializePublicFeed((data ?? []) as ActivityRow[]), generatedAt: new Date().toISOString() },
    { headers: { ...NO_STORE, ...rateLimitHeaders(rl) } },
  );
}
