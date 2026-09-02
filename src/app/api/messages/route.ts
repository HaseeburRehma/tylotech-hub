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
    parentId?: string | null;
    mentions?: string[];
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

  // Thread support: validate parentId if provided.
  const parentId: string | null = body.parentId ?? null;
  if (parentId) {
    const { data: parent } = await sb.from("messages").select("id").eq("id", parentId).single();
    if (!parent) return NextResponse.json({ error: "Parent message not found." }, { status: 400 });
  }

  const { data, error } = await sb
    .from("messages")
    .insert({
      client_id: clientId,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      recipient_id: recipientId,
      parent_id: parentId,
      content,
      content_translated: contentTranslated,
      translated_to: internal ? null : target,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Update parent's reply count + last_reply_at.
  if (parentId) {
    const admin = createAdminClient();
    if (admin) {
      try {
        // Direct update for reply_count and last_reply_at
        const { data: parentMsg } = await admin.from("messages").select("reply_count").eq("id", parentId).single();
        await admin.from("messages").update({
          reply_count: (parentMsg?.reply_count ?? 0) + 1,
          last_reply_at: new Date().toISOString(),
        }).eq("id", parentId);
      } catch { /* tolerate missing column during migration window */ }
    }
  }

  // Record @mentions and notify mentioned users.
  const mentionIds: string[] = body.mentions ?? [];
  if (mentionIds.length > 0 && data?.id) {
    const mentionRows = mentionIds.map((uid) => ({ message_id: data.id, user_id: uid }));
    try { await sb.from("mentions").insert(mentionRows); } catch { /* tolerate missing table */ }
    // Notify each mentioned user
    for (const uid of mentionIds) {
      if (uid !== user.id) {
        const href = internal ? "/internal/team" : isClient ? `/internal/clients/${clientId}` : "/chat";
        try {
          await notifyUser(uid, {
            title: `${user.name} mentioned you`,
            body: content.slice(0, 120),
            href,
            type: "message",
          });
        } catch { /* best-effort */ }
      }
    }
  }

  // Notify the other side of the conversation (in-app + bilingual email).
  const preview = content.slice(0, 120);
  const email = { senderName: user.name, preview: content };
  if (recipientId) {
    // Direct message → notify only the recipient.
    const href = internal ? "/internal/team" : isClient ? `/internal/clients/${clientId}` : "/chat";
    await notifyUser(recipientId, { title: `New message from ${user.name}`, body: preview, href, type: "message", email });
  } else if (internal) {
    // Internal group → notify all staff.
    await notifyStaff({ title: `Team chat · ${user.name}`, body: preview, href: "/internal/team", type: "message", email });
  } else if (isClient) {
    await notifyStaff({ title: `New message from ${user.name}`, body: preview, href: `/internal/clients/${clientId}`, type: "message", email });
  } else {
    await notifyClientUsers(clientId!, { title: "New message from your TyloTech team", body: preview, href: "/chat", type: "message", email });
  }

  return NextResponse.json({ ok: true, message: data });
}

/** Edit a message — RLS restricts this to the message's own sender. */
export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`msg:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; content?: string };
  const content = body.content?.trim();
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Message is empty." }, { status: 400 });

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Read the row (RLS = participant) to know its workspace for re-translation.
  const { data: existing } = await sb.from("messages").select("client_id,sender_id").eq("id", body.id).single();
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.sender_id !== user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const internal = user.role !== "client" && existing.client_id == null;
  const target = user.role === "client" ? "en" : "de";
  const contentTranslated = internal ? null : await translateMessage(content, target);

  // RLS update policy also enforces sender-only; select back only safe columns.
  const { data, error } = await sb
    .from("messages")
    .update({ content, content_translated: contentTranslated, translated_to: internal ? null : target, edited_at: new Date().toISOString() })
    .eq("id", body.id)
    .select("id,client_id,sender_id,sender_name,sender_role,recipient_id,content,content_translated,translated_to,attachment_name,attachment_mime,attachment_size,edited_at,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: data });
}

/** Delete a message (+ its attachment) — RLS restricts this to the sender. */
export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Read via RLS (participant) to find any attachment; ownership is enforced by
  // the delete policy + the explicit check below.
  const { data: msg } = await sb.from("messages").select("sender_id,attachment_path").eq("id", id).single();
  if (!msg) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (msg.sender_id !== user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { error } = await sb.from("messages").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const path = (msg as { attachment_path?: string }).attachment_path;
  if (path) await admin.storage.from("chat").remove([path]);

  return NextResponse.json({ ok: true });
}
