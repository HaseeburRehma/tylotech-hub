import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockSync = vi.fn();
vi.mock("@/lib/leads-meta", () => ({ syncMetaLeads: (...a: unknown[]) => mockSync(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const mockSheets = vi.fn();
vi.mock("@/lib/leads-sheets", () => ({ syncSheetLeads: (...a: unknown[]) => mockSheets(...a) }));
const mockApis = vi.fn();
vi.mock("@/lib/lead-sync-api", () => ({ syncApiLeadSources: (...a: unknown[]) => mockApis(...a) }));
let sheetsFree = true;
const limitCalls: unknown[] = [];
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: async (...a: unknown[]) => (limitCalls.push(a), { success: sheetsFree }) }) }));

import { GET, POST } from "./route";

const SECRET = "test-cron-secret-1234567890";
const call = (h?: string, method: "GET" | "POST" = "POST") =>
  (method === "GET" ? GET : POST)(new Request("http://x/api/leads/meta/poll", { method, headers: h ? { authorization: h } : {} }));

const prev = process.env.CRON_SECRET;
beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  mockSync.mockReset().mockResolvedValue(2);
  mockSheets.mockReset().mockResolvedValue({ added: 1, updated: 0, alerted: 1, pending: 0 });
  sheetsFree = true;
  limitCalls.length = 0;
  mockApis.mockReset().mockResolvedValue(3);
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
    expect(mockSync.mock.calls[0][1]).toEqual({ notify: true, overlapMinutes: 15, activeFormsOnly: true, notifyMaxAgeMinutes: 1440, minIntervalMs: 50_000 });
    expect((await call(`Bearer ${SECRET}`, "GET")).status).toBe(200);
  });
});

describe("poll also reads Google Sheets", () => {
  it("runs both and reports both", async () => {
    const r = await call(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, added: 2, sheets: { added: 1 } });
    expect(mockSheets).toHaveBeenCalledTimes(1);
  });
  it("a failing sheet read doesn't break the Meta poll", async () => {
    mockSheets.mockRejectedValue(new Error("boom"));
    const r = await call(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, added: 2, sheets: null });
  });
  it("every 20 s: a tick that finds the last sheet run still going leaves sheets alone; Meta still runs", async () => {
    sheetsFree = false;
    const r = await call(`Bearer ${SECRET}`);
    expect(await r.json()).toMatchObject({ ok: true, added: 2, sheets: null });
    expect(mockSheets).not.toHaveBeenCalled();
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(limitCalls[0]).toEqual(["lead-poll:sheets", { limit: 1, windowSec: 15 }]);
  });
  it("sheet runs stay inside one tick (15 s budget)", async () => {
    await call(`Bearer ${SECRET}`);
    expect(mockSheets.mock.calls[0][1]).toEqual({ budgetMs: 15_000 });
  });
  it("also fetches HubSpot / Pipedrive / Google Ads lead forms, each at most once a minute", async () => {
    const r = await call(`Bearer ${SECRET}`);
    expect(await r.json()).toMatchObject({ apis: 3 });
    expect(mockApis.mock.calls[0][1]).toEqual({ minIntervalMs: 50_000 });
  });
  it("a failing API source doesn't break the poll", async () => {
    mockApis.mockRejectedValue(new Error("hubspot down"));
    const r = await call(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, added: 2, apis: null });
  });
  it("unauthorised calls read nothing", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    expect(mockSheets).not.toHaveBeenCalled();
  });
});
