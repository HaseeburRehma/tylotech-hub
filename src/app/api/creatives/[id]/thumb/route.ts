import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { bad, UUID_RE } from "@/lib/creatives-server";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type What = "thumb" | "preview";
const COLUMN: Record<What, "thumb_path" | "preview_path"> = { thumb: "thumb_path", preview: "preview_path" };
const where = (clientId: string, id: string, what: What) => `${clientId}/${what === "thumb" ? "thumbs" : "previews"}/${id}.jpg`;

async function load(id: string, what: unknown) {
  const user = await getAuthUser();
  if (!user) return { error: bad("Unauthorized.", 401) } as const;
  // Made by the team's browsers (canvas, PDF and HEIC readers) while they look at the page.
  if (!isStaff(user)) return { error: bad("Forbidden.", 403) } as const;
  if (!UUID_RE.test(id) || (what !== "thumb" && what !== "preview")) return { error: bad("Not found.", 404) } as const;
  const admin = createAdminClient();
  if (!admin) return { error: bad("Backend not configured.", 503) } as const;
  const { data: c } = await admin.from("creatives").select("id,client_id").eq("id", id).maybeSingle();
  if (!c) return { error: bad("Not found.", 404) } as const;
  return { error: null, user, admin, c, what: what as What, path: where(c.client_id, c.id, what as What) } as const;
}

/** A signed link to store this creative's thumbnail or preview JPEG (team only). Body: { what }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const b = (await req.json().catch(() => null)) as { what?: unknown } | null;
  const ctx = await load(params.id, b?.what);
  if (ctx.error) return ctx.error;
  const rl = await getRateLimiter().limit(`creative-thumb:${ctx.user.id}`, { limit: 300, windowSec: 60 });
  if (!rl.success) return bad("Too many requests.", 429);
  const { data, error } = await ctx.admin.storage.from("creatives").createSignedUploadUrl(ctx.path, { upsert: true });
  if (error || !data) return bad("Could not prepare the upload.", 502);
  return NextResponse.json({ path: ctx.path, token: data.token });
}

/** Record the stored JPEG once it's there (team only). Body: { what }. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const b = (await req.json().catch(() => null)) as { what?: unknown } | null;
  const ctx = await load(params.id, b?.what);
  if (ctx.error) return ctx.error;
  const dir = ctx.path.slice(0, ctx.path.lastIndexOf("/"));
  const base = ctx.path.slice(ctx.path.lastIndexOf("/") + 1);
  const { data: listed } = await ctx.admin.storage.from("creatives").list(dir, { search: base, limit: 5 });
  const obj = (listed ?? []).find((o) => o.name === base);
  if (!obj) return bad("The image didn't arrive.", 400);
  if (Number((obj.metadata as { size?: number } | null)?.size) > 8 * 1024 * 1024) {
    await ctx.admin.storage.from("creatives").remove([ctx.path]);
    return bad("Too large for a preview.", 413);
  }
  const { error } = await ctx.admin.from("creatives").update({ [COLUMN[ctx.what]]: ctx.path }).eq("id", ctx.c.id);
  if (error) return bad(/thumb_path|preview_path/.test(error.message) ? "Previews need the database update 0050_creative_previews.sql." : "Could not save.", 400);
  return NextResponse.json({ ok: true });
}
