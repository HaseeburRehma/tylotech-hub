import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockConnectMetaPages = vi.fn();
let nonceCookie: string | undefined;

vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "acme" } }) }) }) }),
  }),
}));
vi.mock("@/lib/leads-meta", () => ({ connectMetaPages: (...a: unknown[]) => mockConnectMetaPages(...a) }));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => (nonceCookie ? { value: nonceCookie } : undefined), delete: vi.fn() }),
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
    expect(mockConnectMetaPages).not.toHaveBeenCalled();
  });

  it("keeps other providers' errors on Integrations", async () => {
    const loc = await call(`error=access_denied&state=${state({ provider: "ga4", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.pathname).toBe("/integrations");
    expect(loc.searchParams.get("error")).toBe("access_denied");
  });

  it("rejects a forged state (nonce not issued to this browser)", async () => {
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "forged" })}`);
    expect(loc.searchParams.get("error")).toBe("bad_state");
    expect(mockConnectMetaPages).not.toHaveBeenCalled();
  });

  it("reports missing_scope when Meta didn't grant lead access", async () => {
    mockConnectMetaPages.mockRejectedValue(new Error("missing_scope"));
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.pathname).toBe("/leads");
    expect(loc.searchParams.get("meta")).toBe("missing_scope");
  });

  it("connects and reports the page count", async () => {
    mockConnectMetaPages.mockResolvedValue(2);
    const loc = await call(`code=abc&state=${state({ provider: "meta_leads", clientId: CLIENT_ID, nonce: "n1" })}`);
    expect(loc.searchParams.get("meta")).toBe("connected");
    expect(loc.searchParams.get("pages")).toBe("2");
    expect(loc.searchParams.get("client")).toBe("acme");
  });
});
