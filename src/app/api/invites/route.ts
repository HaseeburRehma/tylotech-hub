import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://tylotech-hub.vercel.app").replace(/\/$/, "");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_INVITES = 10;

/**
 * Invite colleagues. Staff invite TyloTech team members; a client user invites
 * people into their own tenant only. Invitees get a link to set their password.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const staffInviter = isStaff(user);
  // Invites send email from our domain — keep volume low enough that this can't
  // be turned into a spam/phishing relay.
  const rl = await getRateLimiter().limit(`invite:${user.id}`, staffInviter ? { limit: 10, windowSec: 3600 } : { limit: 3, windowSec: 3600 });
  if (!rl.success) {
    return NextResponse.json({ error: "Too many invitations — please try again later." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { invites?: { email?: string; name?: string; title?: string }[] } | null;
  const rows = (body?.invites ?? [])
    .map((i) => ({
      email: (i.email ?? "").trim().toLowerCase(),
      name: (i.name ?? "").trim().slice(0, 120),
      title: (i.title ?? "").trim().slice(0, 80) || null,
    }))
    .filter((i) => i.email);
  if (!rows.length) return NextResponse.json({ error: "Add at least one email address." }, { status: 400 });
  const maxInvites = staffInviter ? MAX_INVITES : 5;
  if (rows.length > maxInvites) return NextResponse.json({ error: `At most ${maxInvites} invites at once.` }, { status: 400 });
  const bad = rows.find((r) => !EMAIL_RE.test(r.email));
  if (bad) return NextResponse.json({ error: `Invalid email: ${bad.email}` }, { status: 400 });

  const staff = staffInviter;
  if (!staff && !user.client_id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const role = staff ? "team" : "client";
  const clientId = staff ? null : user.client_id;
  const workspace = staff ? "TyloTech" : user.company ?? "TyloTech";

  const results: { email: string; status: "invited" | "exists" | "error"; emailed?: boolean; error?: string }[] = [];
  const unique = Array.from(new Map(rows.map((r) => [r.email, r])).values());
  const { data: existingProfiles } = await admin.from("users").select("email").in("email", unique.map((r) => r.email));
  const taken = new Set((existingProfiles ?? []).map((u: { email: string }) => u.email.toLowerCase()));

  for (const r of unique) {
    // Never touch an existing account (wrong tenant/role takeover risk).
    if (taken.has(r.email)) {
      results.push({ email: r.email, status: "exists" });
      continue;
    }
    const name = r.name || r.email.split("@")[0];
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: r.email,
      options: { data: { name, role } },
    });
    if (error || !data?.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      results.push({ email: r.email, status: exists ? "exists" : "error", error: exists ? undefined : error?.message });
      continue;
    }
    // A link for an already-confirmed or older auth user means the account exists.
    const isNew = !data.user.email_confirmed_at && Date.now() - new Date(data.user.created_at).getTime() < 120_000;
    if (!isNew) {
      results.push({ email: r.email, status: "exists" });
      continue;
    }
    const profile = { id: data.user.id, email: r.email, name, role, client_id: clientId, title: r.title };
    const { error: pErr } = await admin.from("users").insert(profile);
    if (pErr) {
      if (pErr.code === "23505") {
        results.push({ email: r.email, status: "exists" });
      } else {
        await admin.auth.admin.deleteUser(data.user.id);
        results.push({ email: r.email, status: "error", error: pErr.message });
      }
      continue;
    }
    const link = `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite&next=/update-password?welcome=1`;
    const emailed = await sendInviteEmail(r.email, link, user.name, workspace);
    results.push({ email: r.email, status: "invited", emailed });
  }

  const invited = results.filter((r) => r.status === "invited");
  if (invited.length) {
    await logAudit(user, {
      action: "invite.send",
      clientId,
      targetType: "user",
      summary: `${invited.length} invite(s) as ${role}`,
    }, admin);
  }
  return NextResponse.json({ ok: true, results });
}
