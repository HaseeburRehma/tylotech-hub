import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server clock, so the Speed-to-Lead countdown can't be fooled by a wrong device
 * clock: the browser measures its offset from this once and times the 60s against
 * server time. Not secret, so no auth; no-store so it's never a stale value.
 */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
