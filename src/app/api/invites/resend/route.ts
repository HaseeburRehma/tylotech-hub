import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Re-send a team invitation: { userId }. Only for staff accounts that have
 * never signed in (a pending invite) — active accounts use "forgot password".
 * Issues a fresh one-time link (the old one may have expired).
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user || !isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const rl = await getRateLimiter().limit(`invite:${user.id}`, { limit: 10, windowSec: 3600 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many invitations. Please try again later." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  const userId = String(body?.userId ?? "");
  if (!UUID_RE.test(userId)) return NextResponse.json({ error: "userId required." }, { status: 400 });

  const { data: target } = await admin.from("users").select("id,email,name,role,client_id,deactivated_at").eq("id", userId).maybeSingle();
  if (!target || !["admin", "team"].includes(target.role) || target.client_id || target.deactivated_at) {
    return NextResponse.json({ error: "Not a pending team member." }, { status: 404 });
  }
  const { data: auth } = await admin.auth.admin.getUserById(userId);
  if (!auth?.user) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (auth.user.last_sign_in_at) {
    return NextResponse.json({ error: "This person has already signed in. They can use “Forgot password”.", code: "active" }, { status: 409 });
  }

  // "recovery" works for existing (invited, unconfirmed) users; verifying it
  // confirms the email and lands on the set-password page like an invite.
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: target.email });
  if (error || !data?.properties?.hashed_token) return NextResponse.json({ error: "Could not create a new link." }, { status: 400 });

  const origin = new URL(req.url).origin;
  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/update-password?welcome=1")}`;
  const emailed = await sendInviteEmail(target.email, link, user.name, "TyloTech");

  await logAudit(user, { action: "invite.resend", clientId: null, targetType: "user", targetId: target.id, summary: `${target.email} · ${emailed ? "emailed" : "email failed"}` }, admin);
  if (!emailed) return NextResponse.json({ error: "The email could not be sent. Check the email settings (Resend).", code: "email_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, emailed: true });
}
