import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { translateMessage, type Lang } from "@/lib/ai/translate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`translate:${user.id}`, config.rateLimit.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const b = (await req.json().catch(() => ({}))) as { text?: string; texts?: unknown; target?: string };
  const target = b.target === "de" ? "de" : b.target === "en" ? "en" : null;

  // Batch mode for "translate this conversation": up to 25 messages per call,
  // counted as one request against the rate limit.
  if (Array.isArray(b.texts)) {
    if (!target) return NextResponse.json({ error: "target (en|de) is required." }, { status: 400 });
    const texts = b.texts.slice(0, 25).map((x) => String(x ?? "").trim().slice(0, 5000));
    if (texts.reduce((n, x) => n + x.length, 0) > 30000) return NextResponse.json({ error: "Text is too long." }, { status: 413 });
    const out: (string | null)[] = new Array(texts.length).fill(null);
    let next = 0;
    // A few at a time — gentle on the translation service.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < texts.length) {
          const i = next++;
          if (texts[i]) out[i] = await translateMessage(texts[i]!, target as Lang);
        }
      }),
    );
    return NextResponse.json({ translations: out });
  }

  const text = b.text?.trim();
  if (!text || !target) {
    return NextResponse.json({ error: "text and target (en|de) are required." }, { status: 400 });
  }
  if (text.length > 5000) return NextResponse.json({ error: "Text is too long." }, { status: 413 });

  const translation = await translateMessage(text, target as Lang);
  // null = the translation service is unavailable (no key / API error / no credits).
  // Signal it so the UI can say "unavailable" instead of silently showing the original.
  if (translation == null) {
    return NextResponse.json({ error: "Translation service unavailable." }, { status: 502 });
  }
  return NextResponse.json({ translation });
}
