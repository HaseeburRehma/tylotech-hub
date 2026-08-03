import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyClientUsers, notifyStaff, notifyUser } from "@/lib/notify";
import { translateMessage } from "@/lib/ai/translate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`msg:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as {
    content?: string;
    clientId?: string;
    recipientId?: string | null;
  };
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "Message is empty." }, { status: 400 });

  const clientId = user.role === "client" ? user.client_id : body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Optional direct-message recipient. Validate the pairing so a client can only
  // DM staff, and staff can only DM a user inside the same tenant. Uses the admin
  // client because RLS hides staff rows from clients (and vice-versa).
  const recipientId: string | null = body.recipientId ?? null;
  if (recipientId) {
    const admin = createAdminClient();
    const { data: recipient } = await (admin ?? sb)
      .from("users")
      .select("id,role,client_id")
      .eq("id", recipientId)
      .single();
    if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 400 });
    const staffRoles = ["admin", "team"];
    const ok =
      user.role === "client"
        ? staffRoles.includes(recipient.role) // client → any staff member
        : recipient.client_id === clientId && recipient.role === "client"; // staff → a user of this tenant
    if (!ok) return NextResponse.json({ error: "Invalid recipient." }, { status: 403 });
  }

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
      recipient_id: recipientId,
      content,
      content_translated: contentTranslated,
      translated_to: target,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify the other side of the conversation.
  if (recipientId) {
    // Direct message → notify only the recipient.
    const href = user.role === "client" ? `/internal/clients/${clientId}` : "/chat";
    await notifyUser(recipientId, {
      title: `New message from ${user.name}`,
      body: content.slice(0, 120),
      href,
      type: "message",
    });
  } else if (user.role === "client") {
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
