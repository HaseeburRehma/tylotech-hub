import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

export type Lang = "en" | "de";

const LANG_NAME: Record<Lang, string> = { en: "English", de: "German" };

/**
 * Translate a chat message into the target language using Claude.
 * Returns the original text unchanged if no API key is configured or on error,
 * so chat never breaks — translation is a graceful enhancement.
 */
export async function translateMessage(text: string, target: Lang): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const trimmed = text.trim();
  if (!apiKey || !trimmed) return text;

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
      messages: [{ role: "user", content: trimmed }],
    });
    const out = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return out || text;
  } catch {
    return text;
  }
}
