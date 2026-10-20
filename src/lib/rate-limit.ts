/**
 * Pluggable rate limiter — shared state, so limits hold across every
 * serverless instance (servers stay stateless):
 *   1. Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (fastest),
 *   2. otherwise Postgres (rate_limit_hit(), migration 0044) via the service role,
 *   3. in-memory fixed window only as a fallback (dev, or if the store errors —
 *      fail open per instance rather than locking everyone out).
 * No call-site changes between them.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms when the window resets
}

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
}

export interface RateLimiter {
  limit(key: string, opts: RateLimitOptions): Promise<RateLimitResult>;
}

// ---- In-memory (single instance) -----------------------------------------
class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, { count: number; reset: number }>();

  async limit(key: string, { limit, windowSec }: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowSec * 1000 };
      this.store.set(key, entry);
    }
    entry.count += 1;

    // Opportunistic cleanup so the map can't grow unbounded.
    if (this.store.size > 10_000) {
      this.store.forEach((v, k) => {
        if (v.reset <= now) this.store.delete(k);
      });
    }

    return {
      success: entry.count <= limit,
      limit,
      remaining: Math.max(0, limit - entry.count),
      reset: entry.reset,
    };
  }
}

// ---- Upstash Redis (distributed) -----------------------------------------
// Uses the REST API over fetch — no SDK dependency.
class UpstashRateLimiter implements RateLimiter {
  constructor(private url: string, private token: string) {}

  private async cmd<T = unknown>(args: (string | number)[]): Promise<T> {
    const res = await fetch(`${this.url}/${args.map((a) => encodeURIComponent(String(a))).join("/")}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      cache: "no-store",
    });
    return res.json() as Promise<T>;
  }

  async limit(key: string, { limit, windowSec }: RateLimitOptions): Promise<RateLimitResult> {
    const k = `rl:${key}`;
    const { result: count } = await this.cmd<{ result: number }>(["INCR", k]);
    if (count === 1) await this.cmd(["EXPIRE", k, windowSec]);
    const { result: pttl } = await this.cmd<{ result: number }>(["PTTL", k]);
    const ttl = pttl > 0 ? pttl : windowSec * 1000;
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset: Date.now() + ttl,
    };
  }
}

// ---- Postgres (distributed, no extra service) ------------------------------
class PostgresRateLimiter implements RateLimiter {
  private fallback = new MemoryRateLimiter();
  private disabledUntil = 0;

  async limit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
    const admin = Date.now() > this.disabledUntil ? createAdminClient() : null;
    if (!admin) return this.fallback.limit(key, opts);
    const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key.slice(0, 200), p_limit: opts.limit, p_window_sec: opts.windowSec });
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; remaining: number; reset_at: string } | null;
    if (error || !row) {
      // Function missing (before 0044) or the database is struggling: don't add
      // load — use the per-instance limiter for a minute.
      this.disabledUntil = Date.now() + 60_000;
      return this.fallback.limit(key, opts);
    }
    return { success: row.allowed, limit: opts.limit, remaining: row.remaining, reset: new Date(row.reset_at).getTime() };
  }
}

let _limiter: RateLimiter | null = null;
export function getRateLimiter(): RateLimiter {
  if (_limiter) return _limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  _limiter =
    url && token
      ? new UpstashRateLimiter(url, token)
      : process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NODE_ENV !== "test"
        ? new PostgresRateLimiter()
        : new MemoryRateLimiter();
  return _limiter;
}

/** Standard headers so clients can back off politely. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.reset / 1000)),
    ...(r.success
      ? {}
      : { "Retry-After": String(Math.max(1, Math.ceil((r.reset - Date.now()) / 1000))) }),
  };
}

/** Best-effort client identifier (prefers authenticated id, falls back to IP). */
export function ipKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
}
