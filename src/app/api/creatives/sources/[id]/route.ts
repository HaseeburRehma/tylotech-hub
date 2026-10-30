import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { removeRows, syncCreativeSources } from "@/lib/creative-sources";
import { bad, UUID_RE } from "@/lib/creatives-server";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

async function load(id: string) {
  const user = await getAuthUser();
  if (!user) return { error: bad("Unauthorized.", 401), user: null, admin: null } as const;
  if (!isStaff(user)) return { error: bad("Forbidden.", 403), user: null, admin: null } as const;
  if (!UUID_RE.test(id)) return { error: bad("Not found.", 404), user: null, admin: null } as const;
  const admin = createAdminClient();
  if (!admin) return { error: bad("Backend not configured.", 503), user: null, admin: null } as const;
  const { data: s } = await admin.from("creative_sources").select("id,client_id,provider,label").eq("id", id).maybeSingle();
  if (!s) return { error: bad("Not found.", 404), user: null, admin: null } as const;
  return { error: null, user, admin, s } as const;
}

/** Read a connected folder now: { action: "sync" } (team only). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await load(params.id);
  if (ctx.error) return ctx.error;
  const b = (await req.json().catch(() => null)) as { action?: string } | null;
  if (b?.action !== "sync") return bad("Unknown action.");
  const rl = await getRateLimiter().limit(`creative-sync:${ctx.s.id}`, { limit: 4, windowSec: 60 });
  if (!rl.success) return bad("Just synced. Try again in a moment.", 429);
  const r = await syncCreativeSources(ctx.admin, { sourceId: ctx.s.id, budgetMs: 40_000 });
  const { data: after } = await ctx.admin.from("creative_sources").select("status,last_error").eq("id", ctx.s.id).maybeSingle();
  if (after?.status === "error") return bad(after.last_error ?? "Sync failed.", 502);
  return NextResponse.json({ ok: true, ...r });
}

/** Disconnect a folder (team only): its files leave the library; nothing changes in the cloud folder. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await load(params.id);
  if (ctx.error) return ctx.error;
  // Files unpacked from its zips live in our storage: remove those copies too.
  const { data: stored } = await ctx.admin.from("creatives").select("id,storage_path").eq("source_id", ctx.s.id).not("storage_path", "is", null);
  if (stored?.length) await removeRows(ctx.admin, stored);
  const { error } = await ctx.admin.from("creative_sources").delete().eq("id", ctx.s.id);
  if (error) return bad("Could not disconnect the folder.");
  await logAudit(ctx.user, { action: "creative_source.delete", clientId: ctx.s.client_id, targetType: "creative_source", targetId: ctx.s.id, summary: `${ctx.s.provider}: ${ctx.s.label}` }, ctx.admin);
  return NextResponse.json({ ok: true });
}
