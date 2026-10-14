import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

export type Lang = "en" | "de";

const LANG_NAME: Record<Lang, string> = { en: "English", de: "German" };
const MAX_CHARS = 5000;

/**
 * Translate a chat message into the target language. Tries, in order:
 *  1. Google Cloud Translation (official API) when GOOGLE_TRANSLATE_API_KEY is
 *     set — free up to 500k characters/month and covered by Google's data
 *     processing terms; preferred for client data.
 *  2. Google Translate's free public endpoint (no key). Works today, but it is
 *     unofficial: no DPA, rate-limited, and Google may change or block it.
 *  3. Claude, when ANTHROPIC_API_KEY is set and has credit.
 * Returns null when every option fails; callers degrade gracefully (the send
 * path stores null, /api/translate returns 502 → "translation unavailable").
 * Text already in the target language comes back unchanged.
 */
export async function translateMessage(text: string, target: Lang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const input = trimmed.slice(0, MAX_CHARS);
  const key = `${target}\u0000${input}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const out =
    (await googleCloudTranslate(input, target)) ?? (await googleFreeTranslate(input, target)) ?? (await claudeTranslate(input, target));
  if (out) {
    // Small per-instance cache: the same text is never sent twice in a row.
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, out);
  }
  return out;
}

const CACHE_MAX = 1000;
const cache = new Map<string, string>();

/** Official Cloud Translation API v2 (needs GOOGLE_TRANSLATE_API_KEY). */
async function googleCloudTranslate(text: string, target: Lang): Promise<string | null> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, target, format: "text" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("googleCloudTranslate failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { data?: { translations?: { translatedText?: string }[] } };
    return json.data?.translations?.[0]?.translatedText?.trim() || null;
  } catch (err) {
    console.error("googleCloudTranslate failed:", err);
    return null;
  }
}

/** Google Translate's free web endpoint (client=gtx). Unofficial — see note above. */
async function googleFreeTranslate(text: string, target: Lang): Promise<string | null> {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ q: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("googleFreeTranslate failed:", res.status);
      return null;
    }
    // Shape: [[["translated", "original", …], …], null, "detected-source-lang", …]
    const json = (await res.json()) as [Array<[string | null, ...unknown[]]> | null, unknown, string?];
    const parts = Array.isArray(json?.[0]) ? json[0] : [];
    const out = parts.map((p) => (Array.isArray(p) && typeof p[0] === "string" ? p[0] : "")).join("").trim();
    return out || null;
  } catch (err) {
    console.error("googleFreeTranslate failed:", err);
    return null;
  }
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
