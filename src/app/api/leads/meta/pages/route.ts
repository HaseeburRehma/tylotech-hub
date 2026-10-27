import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { leadsContext } from "@/lib/leads";
import { connectMetaPages, listMetaPages, META_PICK_COOKIE, openMetaPick } from "@/lib/leads-meta";
import { getRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const expired = () => NextResponse.json({ error: "The Meta sign-in expired. Connect Meta again.", code: "expired" }, { status: 410 });

/**
 * After "Connect Meta": the pages this sign-in may use, for the partner to pick
 * from (?clientId= for the team). Needs the sealed cookie set by the callback
 * for the same user and partner.
 */
export async function GET(req: Request) {
  const ctx = await leadsContext(new URL(req.url).searchParams.get("clientId"));
  if ("error" in ctx) return ctx.error;
  const pick = openMetaPick(cookies().get(META_PICK_COOKIE)?.value, { userId: ctx.user.id, clientId: ctx.clientId });
  if (!pick) return expired();
  const rl = await getRateLimiter().limit(`meta-pages:${ctx.user.id}`, { limit: 20, windowSec: 600 });
  if (!rl.success) return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });

  let pages;
  try {
    pages = await listMetaPages(pick.t);
  } catch (e) {
    return NextResponse.json({ error: `Meta: ${(e as Error).message}`.slice(0, 200) }, { status: 502 });
  }
  const { data: mine } = await ctx.admin.from("lead_sources").select("external_id").eq("client_id", ctx.clientId).eq("kind", "meta").neq("status", "disconnected");
  const connected = new Set((mine ?? []).map((s: { external_id: string | null }) => s.external_id));
  return NextResponse.json({
    pages: pages.map((p) => ({ id: p.id, name: p.name, usable: !!p.access_token, connected: connected.has(p.id) })),
  });
}

/** Connect the chosen pages: { clientId? (team), pageIds: string[] }. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; pageIds?: unknown };
  const ctx = await leadsContext(b.clientId ?? null);
  if ("error" in ctx) return ctx.error;
  const pageIds = Array.isArray(b.pageIds) ? b.pageIds.filter((x): x is string => typeof x === "string" && /^\d{1,30}$/.test(x)).slice(0, 50) : [];
  if (!pageIds.length) return NextResponse.json({ error: "Pick at least one page." }, { status: 400 });
  const jar = cookies();
  const pick = openMetaPick(jar.get(META_PICK_COOKIE)?.value, { userId: ctx.user.id, clientId: ctx.clientId });
  if (!pick) return expired();
  const rl = await getRateLimiter().limit(`meta-pages:${ctx.user.id}`, { limit: 20, windowSec: 600 });
  if (!rl.success) return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });

  let connected: number;
  try {
    // Only ids this sign-in actually lists can be connected (checked inside).
    connected = await connectMetaPages(ctx.admin, { userToken: pick.t, pageIds, clientId: ctx.clientId, userId: ctx.user.id });
  } catch (e) {
    return NextResponse.json({ error: `Meta: ${(e as Error).message}`.slice(0, 200) }, { status: 502 });
  }
  if (!connected) return NextResponse.json({ error: "None of the chosen pages could be connected. You need a task on the page (or the page's business) in Meta." }, { status: 422 });
  jar.delete({ name: META_PICK_COOKIE, path: "/api/leads/meta" });
  return NextResponse.json({ ok: true, connected });
}
