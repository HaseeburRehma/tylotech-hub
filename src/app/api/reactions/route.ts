import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Toggle a reaction: POST adds it, DELETE removes it. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    messageId?: string;
    emoji?: string;
  };
  if (!body.messageId || !body.emoji) {
    return NextResponse.json({ error: "messageId and emoji required." }, { status: 400 });
  }
  // Sanitize emoji — allow only actual emoji chars (1-4 codepoints).
  const emoji = body.emoji.trim().slice(0, 8);
  if (!emoji) return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Check if already reacted → toggle off
  const { data: existing } = await sb
    .from("reactions")
    .select("id")
    .eq("message_id", body.messageId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await sb.from("reactions").delete().eq("id", existing.id);
    return NextResponse.json({ ok: true, action: "removed" });
  }

  const { error } = await sb.from("reactions").insert({
    message_id: body.messageId,
    user_id: user.id,
    emoji,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, action: "added" });
}
