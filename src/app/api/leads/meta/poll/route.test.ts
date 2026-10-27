import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockSync = vi.fn();
vi.mock("@/lib/leads-meta", () => ({ syncMetaLeads: (...a: unknown[]) => mockSync(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { GET, POST } from "./route";

const SECRET = "test-cron-secret-1234567890";
const call = (h?: string, method: "GET" | "POST" = "POST") =>
  (method === "GET" ? GET : POST)(new Request("http://x/api/leads/meta/poll", { method, headers: h ? { authorization: h } : {} }));

const prev = process.env.CRON_SECRET;
beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  mockSync.mockReset().mockResolvedValue(2);
});
afterEach(() => {
  process.env.CRON_SECRET = prev;
});

describe("/api/leads/meta/poll", () => {
  it("rejects calls without or with a wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("fails closed when the server has no secret", async () => {
    delete process.env.CRON_SECRET;
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("polls in lean mode with alerts on (POST from pg_net, GET works too)", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect((await res.json()).added).toBe(2);
    expect(mockSync.mock.calls[0][1]).toEqual({ notify: true, overlapMinutes: 15, activeFormsOnly: true, notifyMaxAgeMinutes: 1440 });
    expect((await call(`Bearer ${SECRET}`, "GET")).status).toBe(200);
  });
});
