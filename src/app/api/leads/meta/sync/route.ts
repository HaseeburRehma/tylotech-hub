import { NextResponse } from "next/server";
import { leadsContext } from "@/lib/leads";
import { syncMetaLeads } from "@/lib/leads-meta";
import { getRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Pull recent Meta leads now: { clientId? (team), days? (1–90) }. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; days?: number };
  const ctx = await leadsContext(b.clientId ?? null);
  if ("error" in ctx) return ctx.error;
  const rl = await getRateLimiter().limit(`lead-sync:${ctx.clientId}`, { limit: 6, windowSec: 600 });
  if (!rl.success) return NextResponse.json({ error: "Just synced. Try again in a few minutes." }, { status: 429 });
  const days = b.days ? Math.min(90, Math.max(1, Math.round(b.days))) : undefined;
  const added = await syncMetaLeads(ctx.admin, { clientId: ctx.clientId, days, notify: false });
  return NextResponse.json({ ok: true, added });
}
