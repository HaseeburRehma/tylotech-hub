import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

export type Lang = "en" | "de";

const LANG_NAME: Record<Lang, string> = { en: "English", de: "German" };

/**
 * Translate a chat message into the target language with Claude.
 *
 * Client messages are confidential, so they only go to our contracted AI
 * provider — never to an unofficial, keyless translation endpoint. Returns
 * `null` when no key is set or the call fails; callers degrade gracefully:
 * the send path stores null (chat never breaks) and /api/translate returns 502
 * so the UI shows "translation unavailable" instead of a dead toggle.
 */
export async function translateMessage(text: string, target: Lang): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return claudeTranslate(trimmed, target);
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
