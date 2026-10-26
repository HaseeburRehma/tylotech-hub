import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockExchange = vi.fn();
const mockList = vi.fn();
const mockCookieSet = vi.fn();
let nonceCookie: string | undefined;

vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "acme" } }) }) }) }),
  }),
}));
vi.mock("@/lib/leads-meta", () => ({
  exchangeMetaCode: (...a: unknown[]) => mockExchange(...a),
  listMetaPages: (t: string) => mockList(t),
  sealMetaPick: (s: Record<string, string>) => `sealed:${s.u}:${s.c}`,
  META_PICK_COOKIE: "meta_pick",
  META_PICK_TTL_SEC: 900,
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => (nonceCookie ? { value: nonceCookie } : undefined), delete: vi.fn(), set: mockCookieSet }),
}));

import { GET } from "./route";
import { CLIENT_USER } from "@/test-utils";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const state = (o: Record<string, string>) => Buffer.from(JSON.stringify(o)).toString("base64url");
const call = async (qs: string) => {
  const res = await GET(new Request(`https://www.tylohq.de/api/integrations/oauth/callback?${qs}`));
  return new URL(res.headers.get("location")!);
};

beforeEach(() => {
  vi.clearAllMocks();
  nonceCookie = "n1";
  mockGetAuthUser.mockResolvedValue({ ...CLIENT_USER, client_id: CLIENT_ID });
});

describe("OAuth callback — Meta Lead Ads", () => {
  it("sends a cancelled Meta dialog back to Leads, not Integrations", async () => {
    const loc = await call(`error=access_denied&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.pathname).toBe("/leads");
    expect(loc.searchParams.get("meta")).toBe("denied");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("keeps other providers' errors on Integrations", async () => {
    const loc = await call(`error=access_denied&state=${state({ provider: "ga4", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.pathname).toBe("/integrations");
    expect(loc.searchParams.get("error")).toBe("access_denied");
  });

  it("rejects a forged state (nonce not issued to this browser)", async () => {
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "forged" })}`);
    expect(loc.searchParams.get("error")).toBe("bad_state");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("reports missing_scope when Meta didn't grant lead access", async () => {
    mockExchange.mockRejectedValue(new Error("missing_scope"));
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.pathname).toBe("/leads");
    expect(loc.searchParams.get("meta")).toBe("missing_scope");
  });

  it("holds the sign-in in a sealed cookie and asks which pages belong to the partner", async () => {
    mockExchange.mockResolvedValue("user-token");
    mockList.mockResolvedValue([{ id: "1", name: "A", access_token: "p" }, { id: "2", name: "B" }]);
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.pathname).toBe("/leads");
    expect(loc.searchParams.get("meta")).toBe("pick");
    expect(loc.searchParams.get("client")).toBe("acme");
    expect(mockCookieSet).toHaveBeenCalledWith("meta_pick", `sealed:${CLIENT_USER.id}:${CLIENT_ID}`, expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/api/leads/meta", maxAge: 900 }));
  });

  it("reports no_pages without setting the cookie when nothing was granted", async () => {
    mockExchange.mockResolvedValue("user-token");
    mockList.mockResolvedValue([]);
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.searchParams.get("meta")).toBe("no_pages");
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
