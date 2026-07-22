import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { notifyClientUsers, notifyStaff } from "@/lib/notify";
import { translateMessage } from "@/lib/ai/translate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`msg:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as { content?: string; clientId?: string };
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "Message is empty." }, { status: 400 });

  const clientId = user.role === "client" ? user.client_id : body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Client writes German → translate to English for the team.
  // Team writes English → translate to German for the client.
  const target = user.role === "client" ? "en" : "de";
  const contentTranslated = await translateMessage(content, target);

  const { data, error } = await sb
    .from("messages")
    .insert({
      client_id: clientId,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      content,
      content_translated: contentTranslated,
      translated_to: target,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify the other side of the conversation.
  if (user.role === "client") {
    await notifyStaff({
      title: `New message from ${user.name}`,
      body: content.slice(0, 120),
      href: `/internal/clients/${clientId}`,
      type: "message",
    });
  } else {
    await notifyClientUsers(clientId, {
      title: "New message from your TyloTech team",
      body: content.slice(0, 120),
      href: "/chat",
      type: "message",
    });
  }

  return NextResponse.json({ ok: true, message: data });
}
