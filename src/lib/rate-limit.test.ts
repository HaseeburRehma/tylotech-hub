import { describe, expect, it } from "vitest";
import { getRateLimiter, ipKey, rateLimitHeaders } from "./rate-limit";

describe("rate limiter (in-memory)", () => {
  it("allows up to the limit then blocks", async () => {
    const rl = getRateLimiter();
    const key = `test-${Math.floor(performance.now())}`;
    const a = await rl.limit(key, { limit: 2, windowSec: 60 });
    const b = await rl.limit(key, { limit: 2, windowSec: 60 });
    const c = await rl.limit(key, { limit: 2, windowSec: 60 });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(c.success).toBe(false);
    expect(c.remaining).toBe(0);
  });
});

describe("rateLimitHeaders", () => {
  it("adds Retry-After only when blocked", () => {
    const ok = rateLimitHeaders({ success: true, limit: 5, remaining: 4, reset: Date.now() + 1000 });
    expect(ok["Retry-After"]).toBeUndefined();
    const blocked = rateLimitHeaders({ success: false, limit: 5, remaining: 0, reset: Date.now() + 5000 });
    expect(Number(blocked["Retry-After"])).toBeGreaterThan(0);
  });
});

describe("ipKey", () => {
  it("reads the first x-forwarded-for entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(ipKey(req)).toBe("1.2.3.4");
  });
});
