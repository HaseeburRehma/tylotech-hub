import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MIN_PASSWORD = 12;

/** An admin creates a new TyloTech team member with a password (no invite code). */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Only admins can create team accounts." }, { status: 403 });

  const rl = await getRateLimiter().limit(`team-create:${user.id}`, config.rateLimit.auth);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const title = body.title?.trim() || null;
  const role = body.role === "admin" ? "admin" : "team";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length > 120) {
    return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > 128) {
    return NextResponse.json({ error: `Password must be ${MIN_PASSWORD}–128 characters.` }, { status: 400 });
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (error || !created.user) {
    return NextResponse.json({ error: error?.message ?? "Could not create the account." }, { status: 400 });
  }

  // Insert the profile. `title` is best-effort in case 0014 hasn't run yet.
  const base = { id: created.user.id, email, name, role, client_id: null } as Record<string, unknown>;
  let pErr = (await admin.from("users").insert({ ...base, title })).error;
  if (pErr) pErr = (await admin.from("users").insert(base)).error; // retry without title column
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  await logAudit(user, { action: "team.create", targetType: "user", targetId: created.user.id, summary: `${name} (${role})` }, admin);
  return NextResponse.json({ ok: true, email });
}
