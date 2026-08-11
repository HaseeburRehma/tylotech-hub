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
    clientId?: string | null;
    recipientId?: string | null;
    internal?: boolean;
  };
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "Message is empty." }, { status: 400 });

  const isClient = user.role === "client";
  // Internal (staff-only) workspace has no tenant → client_id null.
  const internal = !isClient && (body.internal === true || body.clientId == null);
  const clientId: string | null = isClient ? user.client_id : internal ? null : body.clientId ?? null;

  if (isClient && !clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (isClient && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isClient && !internal && !clientId) {
    return NextResponse.json({ error: "Missing client." }, { status: 400 });
  }

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const staffRoles = ["admin", "team"];

  // Optional direct-message recipient. Validate the pairing: a client DMs staff,
  // staff DM a user in the same tenant, and internal DMs are staff↔staff.
  const recipientId: string | null = body.recipientId ?? null;
  if (recipientId) {
    const admin = createAdminClient();
    const { data: recipient } = await (admin ?? sb)
      .from("users")
      .select("id,role,client_id")
      .eq("id", recipientId)
      .single();
    if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 400 });
    const ok = isClient
      ? staffRoles.includes(recipient.role) // client → any staff member
      : internal
        ? staffRoles.includes(recipient.role) // internal → another staff member
        : recipient.client_id === clientId && recipient.role === "client"; // staff → a user of this tenant
    if (!ok) return NextResponse.json({ error: "Invalid recipient." }, { status: 403 });
  }

  // Client writes German → translate to English for the team.
  // Team writes English → translate to German for the client.
  // Internal staff↔staff needs no translation.
  const target = isClient ? "en" : "de";
  const contentTranslated = internal ? null : await translateMessage(content, target);

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
      translated_to: internal ? null : target,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify the other side of the conversation.
  const preview = content.slice(0, 120);
  if (recipientId) {
    // Direct message → notify only the recipient.
    const href = internal ? "/internal/team" : isClient ? `/internal/clients/${clientId}` : "/chat";
    await notifyUser(recipientId, {
      title: `New message from ${user.name}`,
      body: preview,
      href,
      type: "message",
    });
  } else if (internal) {
    // Internal group → notify all staff.
    await notifyStaff({ title: `Team chat · ${user.name}`, body: preview, href: "/internal/team", type: "message" });
  } else if (isClient) {
    await notifyStaff({
      title: `New message from ${user.name}`,
      body: preview,
      href: `/internal/clients/${clientId}`,
      type: "message",
    });
  } else {
    await notifyClientUsers(clientId!, {
      title: "New message from your TyloTech team",
      body: preview,
      href: "/chat",
      type: "message",
    });
  }

  return NextResponse.json({ ok: true, message: data });
}
