/**
 * Central app configuration. Keep tunables here (not scattered in code) so scaling
 * decisions are one edit. Values can be overridden by env without redeploying logic.
 */
const num = (v: string | undefined, fallback: number) =>
  v && !Number.isNaN(Number(v)) ? Number(v) : fallback;

export const config = {
  /** Per-identity rate limits: { limit } requests per { windowSec } seconds. */
  rateLimit: {
    ai: { limit: num(process.env.RL_AI_LIMIT, 20), windowSec: num(process.env.RL_AI_WINDOW, 60) },
    auth: { limit: num(process.env.RL_AUTH_LIMIT, 10), windowSec: num(process.env.RL_AUTH_WINDOW, 60) },
    api: { limit: num(process.env.RL_API_LIMIT, 120), windowSec: num(process.env.RL_API_WINDOW, 60) },
  },
  ai: {
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
    // Fast, low-cost model for chat translation.
    translateModel: process.env.ANTHROPIC_TRANSLATE_MODEL ?? "claude-haiku-4-5-20251001",
    maxTokens: num(process.env.ANTHROPIC_MAX_TOKENS, 1024),
  },
} as const;

export type AppConfig = typeof config;
