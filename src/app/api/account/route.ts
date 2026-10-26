import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Fixed, locale-independent word the client sends once the user has typed theirs. */
const DELETE_CONFIRM = "DELETE";

/**
 * Self-service account deletion (App Store guideline 5.1.1(v)), used by the
 * mobile app with a Bearer token and usable from the web with cookies.
 *
 * Deletes the auth user; the profile row and everything hanging off it with
 * ON DELETE CASCADE (own messages, reactions, notifications, devices, reads)
 * goes with it. Company data — projects, documents, reports — belongs to the
 * client and stays. Staff accounts are removed by an admin instead, so the
 * agency can't lose its last admin or its replies in client chats.
 */
export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user || user.id === "demo") return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== "client") {
    return NextResponse.json({ error: "Team accounts are removed by an admin." }, { status: 403 });
  }

  const rl = await getRateLimiter().limit(`account-delete:${user.id}`, { limit: 3, windowSec: 3600 });
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const b = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (b?.confirm !== DELETE_CONFIRM) return NextResponse.json({ error: "Confirmation missing." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Audit first: once the user is gone the log can't reference them (actor_id
  // is set null on delete, the name stays).
  const audit = { clientId: user.client_id, targetType: "user", targetId: user.id };
  await logAudit(user, { ...audit, action: "account.delete", summary: "Self-service account deletion" }, admin);

  // activity_events.created_by has no ON DELETE rule and would block the delete.
  await admin.from("activity_events").update({ created_by: null }).eq("created_by", user.id);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("account deletion failed:", error.message);
    await logAudit(user, { ...audit, action: "account.delete_failed", summary: error.message }, admin);
    return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  }

  // The avatar lives in a public bucket — remove it with the account.
  const avatar = user.avatarUrl?.split("/logos/")[1];
  if (avatar?.startsWith(`avatars/${user.id}-`)) await admin.storage.from("logos").remove([avatar]);

  return NextResponse.json({ ok: true });
}
