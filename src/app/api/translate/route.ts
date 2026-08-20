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

  const b = (await req.json().catch(() => ({}))) as { text?: string; target?: string; debug?: boolean };
  const text = b.text?.trim();
  const target = b.target === "de" ? "de" : b.target === "en" ? "en" : null;
  if (!text || !target) {
    return NextResponse.json({ error: "text and target (en|de) are required." }, { status: 400 });
  }

  // TEMP diagnostic — remove after debugging the "not translating" report.
  if (b.debug) {
    const { config } = await import("@/lib/config");
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const info: Record<string, unknown> = {
      hasKey: Boolean(apiKey),
      keyPrefix: apiKey ? apiKey.slice(0, 8) : null,
      model: config.ai.translateModel,
    };
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: config.ai.translateModel,
        max_tokens: 256,
        system: `Translate into English. Output only the translation.`,
        messages: [{ role: "user", content: text }],
      });
      info.ok = true;
      info.out = msg.content.filter((x: any) => x.type === "text").map((x: any) => x.text).join("");
    } catch (e: any) {
      info.ok = false;
      info.errName = e?.name ?? null;
      info.errStatus = e?.status ?? null;
      info.errMessage = String(e?.message ?? e).slice(0, 300);
    }
    return NextResponse.json({ debug: info });
  }

  const translation = await translateMessage(text, target as Lang);
  return NextResponse.json({ translation });
}
