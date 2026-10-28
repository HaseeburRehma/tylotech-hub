import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.fn();
const meta = vi.fn();
const google = vi.fn();
let rows: any[] = [];
vi.mock("@/lib/leads", () => ({ leadsContext: (...a: unknown[]) => ctx(...a) }));
vi.mock("@/lib/integrations/campaigns", () => ({ metaCampaignStats: (...a: unknown[]) => meta(...a), googleCampaignStats: (...a: unknown[]) => google(...a) }));
vi.mock("@/lib/integrations/oauth", () => ({ refreshGoogleAccessToken: async (t: string) => (t === "rt" ? "at" : null) }));
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: async () => ({ success: true }) }) }));

import { GET } from "./route";

const admin = {
  from: () => {
    const c: any = {};
    c.select = () => c;
    c.eq = () => c;
    c.in = () => c;
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows }).then(res);
    return c;
  },
};
let n = 0;
const call = async (qs: string) => (await GET(new Request(`http://x/api/leads/campaigns?${qs}`)))!;

beforeEach(() => {
  // A fresh client id per test so the 60 s cache never leaks between tests.
  ctx.mockResolvedValue({ user: { id: "u1" }, admin, clientId: `c-${++n}` });
  rows = [
    { provider: "meta_ads", access_token: "META_SECRET_TOKEN", refresh_token: null, meta: { accountId: "act_1" } },
    { provider: "google_ads", access_token: null, refresh_token: "rt", meta: { accountId: "185-986-0474", loginCustomerId: "132-838-6899" } },
  ];
  meta.mockReset().mockResolvedValue({ campaigns: [{ id: "1", name: "Franchise Ads", platform: "meta", spend: 95.65, impressions: 1, clicks: 1, platformLeads: 23, ads: [] }], currency: "EUR" });
  google.mockReset().mockResolvedValue({ campaigns: [{ id: "g", name: "Search", platform: "google", spend: 140, impressions: 1, clicks: 1, platformLeads: 3, ads: [] }], currency: "EUR" });
});

describe("GET /api/leads/campaigns", () => {
  it("passes the access decision through (no session, other tenant)", async () => {
    ctx.mockResolvedValueOnce({ error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) });
    expect((await call("")).status).toBe(401);
    ctx.mockResolvedValueOnce({ error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) });
    expect((await call("clientId=other")).status).toBe(403);
    expect(meta).not.toHaveBeenCalled();
  });

  it("rejects bad or half ranges", async () => {
    for (const qs of ["from=2026-10-01", "from=x&to=y", "from=2026-10-10&to=2026-10-01", "from=2026-10-01&to=2026-10-02';DROP"]) {
      expect((await call(qs)).status).toBe(400);
    }
    expect(meta).not.toHaveBeenCalled();
  });

  it("merges Meta and Google, passes the range and the manager id; never returns tokens", async () => {
    const r = await call("from=2026-09-28&to=2026-10-27");
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.campaigns.map((c: any) => c.name)).toEqual(["Franchise Ads", "Search"]);
    expect(meta).toHaveBeenCalledWith("META_SECRET_TOKEN", "act_1", "2026-09-28", "2026-10-27");
    expect(google).toHaveBeenCalledWith("at", "185-986-0474", "132-838-6899", "2026-09-28", "2026-10-27");
    expect(JSON.stringify(body)).not.toMatch(/META_SECRET_TOKEN|"rt"|refresh/);
  });

  it("all time = no dates; a failing platform is reported, the other still shows", async () => {
    meta.mockResolvedValueOnce({ error: "(#200) Missing ads_read" });
    const body = await (await call("")).json();
    expect(meta).toHaveBeenCalledWith("META_SECRET_TOKEN", "act_1", null, null);
    expect(body.errors).toEqual([{ provider: "meta_ads", error: "(#200) Missing ads_read" }]);
    expect(body.campaigns.map((c: any) => c.name)).toEqual(["Search"]);
  });

  it("an expired Google sign-in is an error, not a crash", async () => {
    rows[1].refresh_token = "revoked";
    const body = await (await call("")).json();
    expect(body.errors[0]).toMatchObject({ provider: "google_ads" });
    expect(google).not.toHaveBeenCalled();
  });

  it("caches a complete answer for the same client and range", async () => {
    await call("from=2026-10-01&to=2026-10-02");
    // Same client id for the second call.
    ctx.mockResolvedValueOnce({ user: { id: "u1" }, admin, clientId: `c-${n}` });
    await call("from=2026-10-01&to=2026-10-02");
    expect(meta).toHaveBeenCalledTimes(1);
  });

  it("no ad accounts connected: empty, not an error", async () => {
    rows = [];
    const body = await (await call("")).json();
    expect(body).toMatchObject({ campaigns: [], errors: [], connected: [] });
  });
});
