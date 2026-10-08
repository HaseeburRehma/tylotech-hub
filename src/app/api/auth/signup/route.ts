import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, ipKey, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Team registration is invite-gated so it can't be self-served by the public.
// No fallback value: a missing env var must reject every signup, never fall
// back to a value that would then be sitting in this public source tree.
const SIGNUP_CODE = process.env.TEAM_SIGNUP_CODE;

function codeMatches(code: unknown) {
  if (typeof code !== "string" || !SIGNUP_CODE) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(SIGNUP_CODE);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!SIGNUP_CODE) {
    return NextResponse.json({ error: "Team signup is not configured." }, { status: 503 });
  }

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
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: "Password must be 12–128 characters." }, { status: 400 });
  }
  // The code grants staff access to every tenant: constant-time compare, and a
  // global budget of failed guesses so rotating IPs can't brute-force it.
  if (!codeMatches(code)) {
    await getRateLimiter().limit("signup-fail:global", { limit: 1, windowSec: 1 }); // count it
    const failed = await getRateLimiter().limit("signup-fail:hour", { limit: 30, windowSec: 3600 });
    if (!failed.success) console.error("team signup: too many wrong codes this hour");
    return NextResponse.json({ error: "Invalid team invite code." }, { status: 403 });
  }
  const blocked = await getRateLimiter().limit("signup-fail:hour", { limit: 30, windowSec: 3600 });
  if (!blocked.success) {
    return NextResponse.json({ error: "Team signup is temporarily locked. Ask an admin for an invite." }, { status: 429 });
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
    // Don't confirm whether the address already has an account.
    if (error) console.error("team signup createUser failed:", error.message);
    return NextResponse.json({ error: "Could not create the account. If you already have one, sign in or reset your password." }, { status: 400 });
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
    console.error("team signup profile insert failed:", profileError.message);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
