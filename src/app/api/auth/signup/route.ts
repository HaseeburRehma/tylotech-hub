import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, ipKey, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Team registration is invite-gated so it can't be self-served by the public.
const SIGNUP_CODE = process.env.TEAM_SIGNUP_CODE ?? "TYLOTECH-TEAM";

export async function POST(req: Request) {
  const rl = await getRateLimiter().limit(`signup:${ipKey(req)}`, config.rateLimit.auth);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: { name?: string; email?: string; password?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const { password, code } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (code !== SIGNUP_CODE) {
    return NextResponse.json({ error: "Invalid team invite code." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "team" },
  });
  if (error || !created.user) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create account." },
      { status: 400 },
    );
  }

  const { error: profileError } = await admin.from("users").insert({
    id: created.user.id,
    email,
    name,
    role: "team",
    client_id: null,
  });

  if (profileError) {
    // Roll back the orphaned auth user so the email stays reusable.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
