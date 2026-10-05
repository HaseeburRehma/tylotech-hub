import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TYPES: EmailOtpType[] = ["recovery", "invite", "signup", "email", "magiclink", "email_change"];

/**
 * Landing point for password-reset and invitation emails. Verifies the one-time
 * token server-side and sets the session cookie, then continues to `next`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirect(url.searchParams.get("next"), "/update-password");

  const fail = () => NextResponse.redirect(new URL("/update-password?error=link_invalid", url.origin));
  if (!tokenHash || !type || !TYPES.includes(type)) return fail();

  const supabase = createClient();
  if (!supabase) return fail();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();

  return NextResponse.redirect(new URL(next, url.origin));
}
