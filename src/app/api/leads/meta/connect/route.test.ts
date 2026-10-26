import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCookieSet = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthUser: () => mockGetAuthUser(),
  isStaff: (u: { role?: string } | null) => !!u && u.role !== "client",
}));
vi.mock("next/headers", () => ({ cookies: () => ({ set: mockCookieSet }) }));

import { GET } from "./route";
import { CLIENT_USER, STAFF_USER } from "@/test-utils";

const get = async (qs = "") => {
  const res = await GET(new Request(`https://www.tylohq.de/api/leads/meta/connect${qs}`));
  return { status: res.status, location: new URL(res.headers.get("location") ?? "http://x/") };
};
const ENV = { META_APP_ID: process.env.META_APP_ID, META_APP_SECRET: process.env.META_APP_SECRET, META_LEADS_CONFIG_ID: process.env.META_LEADS_CONFIG_ID };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.META_APP_ID = "1350921847025951";
  process.env.META_APP_SECRET = "test-secret";
  delete process.env.META_LEADS_CONFIG_ID;
});
afterEach(() => {
  for (const [k, v] of Object.entries(ENV)) v === undefined ? delete process.env[k] : (process.env[k] = v);
});

describe("GET /api/leads/meta/connect", () => {
  it("sends signed-out users to login", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    expect((await get()).location.pathname).toBe("/login");
  });

  it("reports not_configured without the Meta app credentials", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    delete process.env.META_APP_SECRET;
    expect((await get()).location.search).toBe("?meta=not_configured");
  });

  it("uses the Login for Business configuration when META_LEADS_CONFIG_ID is set (no scope)", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    process.env.META_LEADS_CONFIG_ID = "987654321012345";
    const { location } = await get();
    expect(location.host).toBe("www.facebook.com");
    expect(location.searchParams.get("config_id")).toBe("987654321012345");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("override_default_response_type")).toBe("true");
    expect(location.searchParams.has("scope")).toBe(false);
    expect(location.searchParams.get("redirect_uri")).toBe("https://www.tylohq.de/api/integrations/oauth/callback");
  });

  it("falls back to scopes (and re-asks declined ones) without a configuration", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const { location } = await get();
    expect(location.searchParams.get("scope")).toContain("leads_retrieval");
    expect(location.searchParams.get("auth_type")).toBe("rerequest");
    expect(location.searchParams.has("config_id")).toBe(false);
  });

  it("ignores a malformed configuration id instead of putting it into the URL", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    process.env.META_LEADS_CONFIG_ID = "123&scope=email";
    const { location } = await get();
    expect(location.searchParams.has("config_id")).toBe(false);
    expect(location.searchParams.get("scope")).toContain("leads_retrieval");
  });

  it("binds a client to their own partner, whatever ?clientId says", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const { location } = await get("?clientId=someone-else");
    const state = JSON.parse(Buffer.from(location.searchParams.get("state")!, "base64url").toString());
    expect(state).toMatchObject({ provider: "meta_leads", clientId: CLIENT_USER.client_id });
    expect(mockCookieSet).toHaveBeenCalledWith("oauth_nonce", state.nonce, expect.objectContaining({ httpOnly: true, path: "/api/integrations" }));
  });

  it("lets the team pick the partner, and requires one", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    expect((await get()).location.search).toBe("?meta=missing_client");
    const { location } = await get("?clientId=c-42");
    expect(JSON.parse(Buffer.from(location.searchParams.get("state")!, "base64url").toString()).clientId).toBe("c-42");
  });
});
