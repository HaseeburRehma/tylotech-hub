import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_PINS = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pin / unpin a message in its conversation: { id, pinned }.
 * Anyone in the conversation may pin (the team and the partner's people alike —
 * briefings, opening hours, logins). Visibility is checked with the user's own
 * session (RLS); the write uses the service role (pins are API-only, 0042).
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: string; pinned?: boolean } | null;
  if (!b?.id || !UUID_RE.test(b.id) || typeof b.pinned !== "boolean") return NextResponse.json({ error: "id and pinned are required." }, { status: 400 });

  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const { data: msg } = await sb.from("messages").select("id,client_id,sender_id,recipient_id,parent_id,content,attachment_name").eq("id", b.id).maybeSingle();
  if (!msg) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (msg.parent_id) return NextResponse.json({ error: "Thread replies can't be pinned." }, { status: 400 });

  if (b.pinned) {
    // Same conversation = same tenant (or internal) and the same DM pair / group.
    let q = admin.from("messages").select("id", { count: "exact", head: true }).not("pinned_at", "is", null);
    q = msg.client_id ? q.eq("client_id", msg.client_id) : q.is("client_id", null);
    q = msg.recipient_id
      ? q.or(`and(sender_id.eq.${msg.sender_id},recipient_id.eq.${msg.recipient_id}),and(sender_id.eq.${msg.recipient_id},recipient_id.eq.${msg.sender_id})`)
      : q.is("recipient_id", null);
    const { count, error } = await q;
    if (error && /pinned_at/.test(error.message)) return NextResponse.json({ error: "Pinning needs database migration 0042." }, { status: 503 });
    if ((count ?? 0) >= MAX_PINS) return NextResponse.json({ error: `At most ${MAX_PINS} pinned messages per chat. Unpin one first.` }, { status: 409 });
  }

  const { data, error } = await admin
    .from("messages")
    .update(b.pinned ? { pinned_at: new Date().toISOString(), pinned_by: user.id } : { pinned_at: null, pinned_by: null })
    .eq("id", msg.id)
    .select("id,pinned_at,pinned_by")
    .single();
  if (error) {
    if (/pinned_at/.test(error.message)) return NextResponse.json({ error: "Pinning needs database migration 0042." }, { status: 503 });
    return NextResponse.json({ error: "Could not update the pin." }, { status: 400 });
  }
  await logAudit(
    user,
    { action: b.pinned ? "message.pin" : "message.unpin", clientId: msg.client_id, targetType: "message", targetId: msg.id, summary: (msg.content || msg.attachment_name || "").slice(0, 80) },
    admin,
  );
  return NextResponse.json({ ok: true, message: data });
}
