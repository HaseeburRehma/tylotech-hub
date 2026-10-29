import { beforeEach, describe, expect, it, vi } from "vitest";

let inserted: any[] = [];
let existingApi: any = null;
const admin: any = {
  from: () => {
    const chain: any = {
      insert: (row: any) => ((inserted.push(row), { select: () => ({ single: async () => ({ data: { id: `src-${inserted.length}`, status: "active", created_at: "x", last_error: null, last_received_at: null, last_synced_at: null, ...row }, error: null }) }) })),
      select: () => chain,
      eq: () => chain,
      contains: () => chain,
      maybeSingle: async () => ({ data: existingApi }),
    };
    return chain;
  },
};
let ctxError: any = null;
vi.mock("@/lib/leads", async () => {
  const { NextResponse } = await import("next/server");
  const real = await vi.importActual<any>("@/lib/leads-shared");
  return {
    LEADS_NOT_READY: "not ready",
    bad: (m: string, s = 400) => NextResponse.json({ error: m }, { status: s }),
    missingLeads: () => false,
    leadsContext: async () => (ctxError ? { error: ctxError } : { user: { id: "u1", role: "client" }, admin, clientId: "c1" }),
    sourceView: (await vi.importActual<any>("@/lib/leads")).sourceView ?? real,
  };
});
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/background", () => ({ inBackground: vi.fn() }));
let limited = false;
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: async () => ({ success: !limited }) }) }));
const verifyHubspot = vi.fn();
const verifyPipedrive = vi.fn();
const googleAdsAccess = vi.fn();
vi.mock("@/lib/lead-sync-api", () => {
  class ApiError extends Error {
    constructor(m: string, readonly status: number) {
      super(m);
    }
  }
  return {
    ApiError,
    API_ERROR_TEXT: { not_connected: "Google Ads ist nicht verbunden." },
    verifyHubspot: (...a: unknown[]) => verifyHubspot(...a),
    verifyPipedrive: (...a: unknown[]) => verifyPipedrive(...a),
    googleAdsAccess: (...a: unknown[]) => googleAdsAccess(...a),
    syncApiLeadSources: vi.fn(),
  };
});
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), isStaff: () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));

import { POST } from "./route";

const call = (body: unknown) => POST(new Request("https://www.tylohq.de/api/leads/sources", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  inserted = [];
  existingApi = null;
  ctxError = null;
  limited = false;
  verifyHubspot.mockReset();
  verifyPipedrive.mockReset();
  googleAdsAccess.mockReset();
});

describe("POST /api/leads/sources", () => {
  it("webhook tools get their own URL + key and remember which tool they are", async () => {
    const r = await call({ provider: "typeform" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(inserted[0]).toMatchObject({ client_id: "c1", kind: "webhook", label: "Typeform", config: { provider: "typeform" } });
    expect(inserted[0].secret).toMatch(/^[\w-]{24}$/);
    expect(j.source).toMatchObject({ provider: "typeform", hookUrl: expect.stringContaining("/api/leads/hook/"), key: inserted[0].secret });
  });

  it("older callers still work (kind google_ads → Google Ads webhook)", async () => {
    await call({ kind: "google_ads" });
    expect(inserted[0]).toMatchObject({ kind: "google_ads", label: "Google Ads Lead-Formular", config: { provider: "google_ads_form" } });
  });

  it("HubSpot: the token is checked first and never sent back", async () => {
    verifyHubspot.mockResolvedValue({ account: "Muster GmbH" });
    const r = await call({ provider: "hubspot", token: "pat-eu1-0123456789abcdef" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(verifyHubspot).toHaveBeenCalledWith("pat-eu1-0123456789abcdef");
    expect(inserted[0]).toMatchObject({ kind: "webhook", label: "HubSpot: Muster GmbH", access_token: "pat-eu1-0123456789abcdef", config: { provider: "hubspot", account: "Muster GmbH" } });
    expect(JSON.stringify(j)).not.toContain("pat-eu1");
    expect(j.source).toMatchObject({ provider: "hubspot", account: "Muster GmbH", hookUrl: null, key: null });
  });

  it("a refused or malformed token creates nothing", async () => {
    const { ApiError } = (await import("@/lib/lead-sync-api")) as any;
    verifyPipedrive.mockRejectedValue(new ApiError("unauthorized", 401));
    const r = await call({ provider: "pipedrive", token: "wrongtoken123" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/refused/);
    expect((await call({ provider: "hubspot", token: "short" })).status).toBe(400);
    expect((await call({ provider: "hubspot", token: "has spaces in it ok" })).status).toBe(400);
    expect(inserted).toEqual([]);
  });

  it("Google Ads via the account: explains when the account isn't connected (with a code for the UI)", async () => {
    googleAdsAccess.mockResolvedValue({ error: "not_connected" });
    const r = await call({ provider: "google_ads" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "not_connected" });
    expect(inserted).toEqual([]);
  });

  it("Google Ads via the account: one source per partner, no URL or key", async () => {
    googleAdsAccess.mockResolvedValue({ token: "t", customerId: "1" });
    const r = await call({ provider: "google_ads" });
    expect(inserted[0]).toMatchObject({ kind: "google_ads", config: { mode: "api" } });
    expect(inserted[0].secret).toBeUndefined();
    expect((await r.json()).source).toMatchObject({ provider: "google_ads", hookUrl: null, key: null });
    existingApi = { id: "old", kind: "google_ads", config: { mode: "api" }, label: "Google Ads", status: "active" };
    await call({ provider: "google_ads" });
    expect(inserted).toHaveLength(1);
  });

  it("unknown providers, Meta and Sheets (they have their own sign-in) are refused", async () => {
    for (const provider of ["nope", "meta", "google_sheet", "__proto__"]) expect((await call({ provider })).status).toBe(400);
    expect(inserted).toEqual([]);
  });

  it("rate limited and signed-out callers create nothing", async () => {
    limited = true;
    expect((await call({ provider: "zapier" })).status).toBe(429);
    limited = false;
    const { NextResponse } = await import("next/server");
    ctxError = NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    expect((await call({ provider: "zapier" })).status).toBe(401);
    expect(inserted).toEqual([]);
  });
});
