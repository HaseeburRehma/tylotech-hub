import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders, ipKey } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

export const runtime = "nodejs";

const APP_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://tylotech-hub.vercel.app").replace(/\/$/, "");

/**
 * Request a password-reset link, delivered via our own Resend template.
 *
 * We generate the recovery link server-side (service role) and email it
 * ourselves — this keeps the branded bilingual template and avoids depending on
 * Supabase's default mail. Always responds { ok: true } regardless of whether
 * the address exists, so the endpoint can't be used to enumerate accounts.
 */
export async function POST(req: Request) {
  // Throttle by IP to stop reset-email flooding of a known address.
  const rl = await getRateLimiter().limit(`reset:${ipKey(req)}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  // Never reveal whether the account exists — succeed silently on bad input too.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  if (!admin) {
    // Backend not configured — don't leak that; the client shows the generic notice.
    return NextResponse.json({ ok: true });
  }

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${APP_URL}/update-password` },
    });
    const link = data?.properties?.action_link;
    // A missing user surfaces as an error here — swallow it so we don't enumerate.
    if (!error && link) {
      await sendPasswordResetEmail(email, link);
    }
  } catch {
    // Swallow — the response is intentionally identical either way.
  }

  return NextResponse.json({ ok: true });
}
