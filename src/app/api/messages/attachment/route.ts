import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { notifyClientUsers, notifyStaff, notifyUser } from "@/lib/notify";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
// Allowed media/doc types. SVG and HTML are excluded: they can carry scripts that
// would execute when served inline from the storage origin (stored-XSS vector).
const ALLOWED = /^(image\/|audio\/|video\/|application\/pdf$|application\/(msword|vnd\.(openxmlformats|ms-)|zip)|text\/(plain|csv))/i;
const BLOCKED = /(svg|html)/i;

/** Upload a chat attachment and post it as a message in the conversation. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`att:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const admin = createAdminClient();
  const sb = createClient();
  if (!admin || !sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const recipientId = (form?.get("recipientId") as string | null) || null;
  const internalFlag = (form?.get("internal") as string | null) === "true";

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 50 MB)." }, { status: 413 });
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.test(mime) || BLOCKED.test(mime)) return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });

  const isClient = user.role === "client";
  const internal = !isClient && (internalFlag || form?.get("clientId") == null);
  const clientId: string | null = isClient ? user.client_id : internal ? null : (form?.get("clientId") as string | null);

  if (isClient && (!clientId || clientId !== user.client_id)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!isClient && !internal && !clientId) {
    return NextResponse.json({ error: "Missing client." }, { status: 400 });
  }

  const staffRoles = ["admin", "team"];
  if (recipientId) {
    const { data: recipient } = await admin.from("users").select("id,role,client_id").eq("id", recipientId).single();
    if (!recipient) return NextResponse.json({ error: "Recipient not found." }, { status: 400 });
    const ok = isClient
      ? staffRoles.includes(recipient.role)
      : internal
        ? staffRoles.includes(recipient.role)
        : recipient.client_id === clientId && recipient.role === "client";
    if (!ok) return NextResponse.json({ error: "Invalid recipient." }, { status: 403 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
  const path = `${clientId ?? "internal"}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from("chat").upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data, error } = await sb
    .from("messages")
    .insert({
      client_id: clientId,
      sender_id: user.id,
      sender_name: user.name,
      sender_role: user.role,
      recipient_id: recipientId,
      content: null,
      attachment_path: path,
      attachment_name: file.name,
      attachment_mime: mime,
      attachment_size: file.size,
    })
    .select("id,client_id,sender_id,sender_name,sender_role,recipient_id,content,attachment_name,attachment_mime,attachment_size,created_at")
    .single();

  if (error) {
    await admin.storage.from("chat").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notify the other side (same routing as text messages).
  const preview = `📎 ${file.name}`;
  const email = { senderName: user.name, preview: file.name, isFile: true };
  if (recipientId) {
    const href = internal ? "/internal/team" : isClient ? `/internal/clients/${clientId}` : "/chat";
    await notifyUser(recipientId, { title: `New file from ${user.name}`, body: preview, href, type: "message", email });
  } else if (internal) {
    await notifyStaff({ title: `Team chat · ${user.name}`, body: preview, href: "/internal/team", type: "message", email });
  } else if (isClient) {
    await notifyStaff({ title: `New file from ${user.name}`, body: preview, href: `/internal/clients/${clientId}`, type: "message", email });
  } else {
    await notifyClientUsers(clientId!, { title: "New file from your TyloTech team", body: preview, href: "/chat", type: "message", email });
  }

  return NextResponse.json({ ok: true, message: data });
}

/** Serve an attachment via a short-lived signed URL — only to conversation participants. */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // RLS ensures the requester can only read messages they participate in.
  const { data: msg } = await sb.from("messages").select("attachment_path").eq("id", id).single();
  const path = (msg as { attachment_path?: string } | null)?.attachment_path;
  if (!path) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data, error } = await admin.storage.from("chat").createSignedUrl(path, 3600);
  if (error || !data) return NextResponse.json({ error: "Could not generate link." }, { status: 400 });
  return NextResponse.redirect(data.signedUrl);
}
