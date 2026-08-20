import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { translateMessage, type Lang } from "@/lib/ai/translate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`translate:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const b = (await req.json().catch(() => ({}))) as { text?: string; target?: string };
  const text = b.text?.trim();
  const target = b.target === "de" ? "de" : b.target === "en" ? "en" : null;
  if (!text || !target) {
    return NextResponse.json({ error: "text and target (en|de) are required." }, { status: 400 });
  }

  const translation = await translateMessage(text, target as Lang);
  // null = the translation service is unavailable (no key / API error / no credits).
  // Signal it so the UI can say "unavailable" instead of silently showing the original.
  if (translation == null) {
    return NextResponse.json({ error: "Translation service unavailable." }, { status: 502 });
  }
  return NextResponse.json({ translation });
}
