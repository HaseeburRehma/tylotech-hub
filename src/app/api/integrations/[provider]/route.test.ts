import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

let stored: Record<string, unknown>;
let updates: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const chain: any = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: { meta: stored } });
    chain.update = (u: Record<string, unknown>) => (updates.push(u), chain);
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res);
    return { from: () => chain };
  },
}));

import { CLIENT_USER, STAFF_USER } from "@/test-utils";
import { POST } from "./route";

const call = async (body: Record<string, unknown>, provider = "google_ads") =>
  (await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "configure", clientId: "tenant-a", ...body }) }), { params: { provider } }))!;

beforeEach(() => {
  stored = { accountId: "185-986-0474", tokenOwner: "staff", managerLookupError: "old" };
  updates = [];
});

describe("configure Google Ads manager (MCC) id", () => {
  it("staff can set it; the old lookup error is cleared", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const r = await call({ loginCustomerId: "132-838-6899" });
    expect(r.status).toBe(200);
    expect(updates[0].meta).toEqual({ accountId: "185-986-0474", tokenOwner: "staff", loginCustomerId: "132-838-6899" });
  });
  it("clearing it removes it, so the next sync detects the manager again", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    stored = { ...stored, loginCustomerId: "132-838-6899" };
    await call({ loginCustomerId: "" });
    expect(updates[0].meta).not.toHaveProperty("loginCustomerId");
  });
  it("rejects anything that isn't a 10-digit Google Ads id", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    for (const bad of ["abc", "132-838-689", "admin@tylotech.de", "1328386899999"]) expect((await call({ loginCustomerId: bad })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
  it("a client can't re-point a connection the agency set up", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    expect((await call({ loginCustomerId: "132-838-6899" })).status).toBe(403);
    expect(updates).toHaveLength(0);
  });
  it("is ignored for other providers", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    stored = { propertyId: "123456" };
    await call({ loginCustomerId: "132-838-6899" }, "ga4");
    expect(updates[0].meta).toEqual({ propertyId: "123456" });
  });
});
