import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const isMissingColumn = (err: { code?: string; message?: string }) =>
  err.code === "42703" || err.code === "PGRST204" || /updated_(at|by)/i.test(err.message ?? "");

/** Edit an AI tool's prompt / active flag. Admin only — prompts affect every client. */
export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can edit AI prompts." }, { status: 403 });
  }

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { slug?: string; prompt_template?: string; is_active?: boolean };
  if (!b.slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.prompt_template !== undefined) {
    if (typeof b.prompt_template !== "string" || b.prompt_template.length > 20000) {
      return NextResponse.json({ error: "Prompt is too long (max 20,000 characters)." }, { status: 400 });
    }
    patch.prompt_template = b.prompt_template;
  }
  if (b.is_active !== undefined) patch.is_active = Boolean(b.is_active);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const audit = { updated_at: new Date().toISOString(), updated_by: user.id };
  let res = await sb.from("ai_tools").update({ ...patch, ...audit }).eq("slug", b.slug).select("slug");
  if (res.error && isMissingColumn(res.error)) res = await sb.from("ai_tools").update(patch).eq("slug", b.slug).select("slug");
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  // RLS silently matches zero rows when not permitted — never report that as saved.
  if (!res.data?.length) return NextResponse.json({ error: "Tool not found or not editable." }, { status: 404 });

  return NextResponse.json({ ok: true, updatedAt: audit.updated_at });
}
