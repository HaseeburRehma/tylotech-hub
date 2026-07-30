import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as {
    slug?: string;
    prompt_template?: string;
    is_active?: boolean;
  };
  if (!b.slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.prompt_template !== undefined) patch.prompt_template = b.prompt_template;
  if (b.is_active !== undefined) patch.is_active = b.is_active;

  const { error } = await sb.from("ai_tools").update(patch).eq("slug", b.slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
