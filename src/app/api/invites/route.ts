import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { config } from "@/lib/config";
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

  const rl = await getRateLimiter().limit(`invite:${user.id}`, config.rateLimit.api);
  if (!rl.success) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });

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
  if (rows.length > MAX_INVITES) return NextResponse.json({ error: `At most ${MAX_INVITES} invites at once.` }, { status: 400 });
  const bad = rows.find((r) => !EMAIL_RE.test(r.email));
  if (bad) return NextResponse.json({ error: `Invalid email: ${bad.email}` }, { status: 400 });

  const staff = isStaff(user);
  if (!staff && !user.client_id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const role = staff ? "team" : "client";
  const clientId = staff ? null : user.client_id;
  const workspace = staff ? "TyloTech" : user.company ?? "TyloTech";

  const results: { email: string; status: "invited" | "exists" | "error"; emailed?: boolean; error?: string }[] = [];
  for (const r of rows) {
    const name = r.name || r.email.split("@")[0];
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: r.email,
      options: { data: { name, role }, redirectTo: `${APP_URL}/update-password` },
    });
    if (error || !data?.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      results.push({ email: r.email, status: exists ? "exists" : "error", error: exists ? undefined : error?.message });
      continue;
    }
    const profile = { id: data.user.id, email: r.email, name, role, client_id: clientId, title: r.title };
    const { error: pErr } = await admin.from("users").upsert(profile);
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id);
      results.push({ email: r.email, status: "error", error: pErr.message });
      continue;
    }
    const emailed = await sendInviteEmail(r.email, data.properties.action_link, user.name, workspace);
    results.push({ email: r.email, status: "invited", emailed });
  }

  return NextResponse.json({ ok: true, results });
}
