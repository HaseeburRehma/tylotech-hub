/**
 * fetch with retries for calls to third-party APIs (Meta, Google, Resend, Expo).
 * Retries only what is worth retrying — network errors, 429 and 502/503/504 —
 * with exponential backoff + jitter, honouring Retry-After (capped). Callers
 * that create something (e.g. sending an email) must pass an idempotency key
 * so a retry after a lost response can't duplicate it.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; baseMs?: number; maxDelayMs?: number; timeoutMs?: number } = {},
): Promise<Response | null> {
  const retries = opts.retries ?? 2;
  const base = opts.baseMs ?? 400;
  const maxDelay = opts.maxDelayMs ?? 5000;
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    } catch {
      res = null; // network error / timeout
    }
    const retryable = !res || res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    if (!retryable || attempt >= retries) return res;
    const retryAfter = Number(res?.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : base * 2 ** attempt;
    const delay = Math.min(maxDelay, backoff) * (0.75 + Math.random() * 0.5);
    await new Promise((r) => setTimeout(r, delay));
  }
}
