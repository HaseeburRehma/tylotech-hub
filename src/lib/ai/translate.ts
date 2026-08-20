import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

export type Lang = "en" | "de";

const LANG_NAME: Record<Lang, string> = { en: "English", de: "German" };

/**
 * Translate a chat message into the target language.
 *
 * Primary engine is Claude (highest quality). If Claude is unavailable — no API
 * key, or the call fails (network, invalid key, or "credit balance too low") —
 * we transparently fall back to a free translation service so the EN/DE toggle
 * keeps working. Returns `null` only when BOTH fail; callers degrade gracefully:
 * the send path stores null (chat never breaks) and /api/translate returns 502
 * so the UI shows "translation unavailable" instead of a dead toggle.
 */
export async function translateMessage(text: string, target: Lang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (await claudeTranslate(trimmed, target)) ?? (await googleTranslate(trimmed, target));
}

/** Claude translation. Returns null when no key is set or the API call fails. */
async function claudeTranslate(text: string, target: Lang): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: config.ai.translateModel,
      // Generous ceiling: chat messages can be long (multi-paragraph briefs), and
      // a truncated translation would fall back to the untranslated original.
      max_tokens: 8192,
      system:
        `You are a professional translator for a marketing agency's client chat. ` +
        `Translate the user's message into ${LANG_NAME[target]}. ` +
        `Preserve tone, meaning, names, brand terms, numbers, emojis and line breaks. ` +
        `If the text is already in ${LANG_NAME[target]}, return it unchanged. ` +
        `Output ONLY the translation — no quotes, labels, notes or explanations.`,
      messages: [{ role: "user", content: text }],
    });
    const out = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return out || null;
  } catch (err) {
    console.error("claudeTranslate failed:", err);
    return null;
  }
}

/**
 * Free fallback via Google's public translate endpoint (no API key). Source
 * language is auto-detected, so it works both DE→EN and EN→DE (and anything the
 * client writes). Long messages are chunked to stay within the GET query limit.
 */
async function googleTranslate(text: string, target: Lang): Promise<string | null> {
  try {
    const parts: string[] = [];
    for (const piece of chunkText(text, 1200)) {
      const url =
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=` +
        encodeURIComponent(piece);
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json().catch(() => null);
      // Shape: [ [ [translatedSegment, originalSegment, ...], ... ], ... ]
      if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
      parts.push(data[0].map((seg: any) => (seg && seg[0]) || "").join(""));
    }
    const out = parts.join("").trim();
    return out || null;
  } catch (err) {
    console.error("googleTranslate failed:", err);
    return null;
  }
}

/** Split text into <= max-length pieces, preferring newline boundaries. */
function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let cur = "";
  for (const seg of text.split(/(\n+)/)) {
    if (cur && (cur + seg).length > max) {
      chunks.push(cur);
      cur = "";
    }
    cur += seg;
    while (cur.length > max) {
      chunks.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
