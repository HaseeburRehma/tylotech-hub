import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { config } from "@/lib/config";
import { FEED_WINDOW_MS, emitActivity, isLiveKind } from "@/lib/live-feed";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Staff management of the live-activity feed (LIVE_FEED.md):
 *   GET    ?clientId=…  → consent + label + the client's recent events
 *   POST   { clientId, kind, title, detail?, occurredAt? } → record a real event manually
 *   PATCH  { id, hidden } → hide/unhide one event (kill-switch)
 * Consent itself (public_feed_opt_in / public_feed_label) is set via PATCH /api/clients/[id].
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function staffContext() {
  const user = await getAuthUser();
  if (!isStaff(user)) return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) } as const;
  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Backend not configured." }, { status: 503 }) } as const;
  return { user: user!, admin } as const;
}

export async function GET(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const clientId = new URL(req.url).searchParams.get("clientId") ?? "";
  if (!UUID_RE.test(clientId)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const [{ data: client }, { data: events, error }] = await Promise.all([
    ctx.admin.from("clients").select("*").eq("id", clientId).maybeSingle(),
    ctx.admin
      .from("activity_events")
      .select("id, kind, title, detail, occurred_at, source, hidden")
      .eq("client_id", clientId)
      .order("occurred_at", { ascending: false })
      .limit(30),
  ]);
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  // Before migration 0031 the table doesn't exist — tell the UI instead of failing.
  if (error) return NextResponse.json({ ready: false, optIn: false, label: "", events: [] });

  return NextResponse.json({
    ready: true,
    optIn: client.public_feed_opt_in === true,
    label: client.public_feed_label ?? "",
    events: events ?? [],
  });
}

export async function POST(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const rl = await getRateLimiter().limit(`activity:${ctx.user.id}`, config.rateLimit.api);
  if (!rl.success) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const clientId = String(b.clientId ?? "");
  if (!UUID_RE.test(clientId)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });
  if (!isLiveKind(b.kind)) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });

  const title = String(b.title ?? "").replace(/\s+/g, " ").trim();
  if (!title || title.length > 80) return NextResponse.json({ error: "Title must be 1–80 characters." }, { status: 400 });
  const detail = b.detail === undefined || b.detail === null || String(b.detail).trim() === "" ? undefined : String(b.detail).replace(/\s+/g, " ").trim();
  if (detail && detail.length > 80) return NextResponse.json({ error: "Detail must be at most 80 characters." }, { status: 400 });

  // When it really happened: default now, never in the future, within the 24 h feed window.
  const now = Date.now();
  const occurred = b.occurredAt ? Date.parse(String(b.occurredAt)) : now;
  if (!Number.isFinite(occurred) || occurred > now + 60_000 || occurred < now - FEED_WINDOW_MS) {
    return NextResponse.json({ error: "Time must be within the last 24 hours." }, { status: 400 });
  }

  const res = await emitActivity(ctx.admin, {
    clientId,
    kind: b.kind,
    title,
    detail,
    occurredAt: new Date(occurred),
    source: "manual",
    sourceRef: `manual:${randomUUID()}`,
    createdBy: ctx.user.id,
  });
  if (!res.ok) return NextResponse.json({ error: res.error ?? "Could not save." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as { id?: string; hidden?: unknown } | null;
  if (!b || !UUID_RE.test(String(b.id ?? "")) || typeof b.hidden !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { data, error } = await ctx.admin.from("activity_events").update({ hidden: b.hidden }).eq("id", b.id!).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
