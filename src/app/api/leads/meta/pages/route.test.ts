import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockCtx = vi.fn();
const mockList = vi.fn();
const mockConnect = vi.fn();
const mockOpen = vi.fn();
const mockDelete = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/lib/leads", () => ({ leadsContext: (id: string | null) => mockCtx(id) }));
vi.mock("@/lib/leads-meta", () => ({
  META_PICK_COOKIE: "meta_pick",
  listMetaPages: (t: string) => mockList(t),
  connectMetaPages: (...a: unknown[]) => mockConnect(...a),
  openMetaPick: (...a: unknown[]) => mockOpen(...a),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => ({ value: "sealed" }), delete: mockDelete }) }));
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: mockLimit }) }));

import { GET, POST } from "./route";

const admin = {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ neq: async () => ({ data: [{ external_id: "1" }] }) }) }) }) }),
};
const CTX = { user: { id: "u1" }, admin, clientId: "c1" };
const post = (body: unknown) => POST(new Request("http://x/api/leads/meta/pages", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockCtx.mockResolvedValue(CTX);
  mockOpen.mockReturnValue({ t: "user-token", c: "c1", u: "u1" });
  mockLimit.mockResolvedValue({ success: true });
});

describe("GET /api/leads/meta/pages", () => {
  it("passes on the access check's error (signed out, wrong partner)", async () => {
    mockCtx.mockResolvedValue({ error: NextResponse.json({}, { status: 403 }) });
    expect((await GET(new Request("http://x/api/leads/meta/pages?clientId=c9"))).status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("requires the sign-in cookie for this user and partner", async () => {
    mockOpen.mockReturnValue(null);
    expect((await GET(new Request("http://x/api/leads/meta/pages"))).status).toBe(410);
    expect(mockOpen).toHaveBeenCalledWith("sealed", { userId: "u1", clientId: "c1" });
  });

  it("lists pages without exposing page tokens", async () => {
    mockList.mockResolvedValue([
      { id: "1", name: "Mine", access_token: "SECRET" },
      { id: "2", name: "No task" },
    ]);
    const res = await GET(new Request("http://x/api/leads/meta/pages"));
    const text = await res.text();
    expect(text).not.toContain("SECRET");
    expect(JSON.parse(text).pages).toEqual([
      { id: "1", name: "Mine", usable: true, connected: true },
      { id: "2", name: "No task", usable: false, connected: false },
    ]);
  });
});

describe("POST /api/leads/meta/pages", () => {
  it("rejects missing or malformed page ids", async () => {
    expect((await post({ pageIds: [] })).status).toBe(400);
    expect((await post({ pageIds: ["../me", 5, "1;drop"] })).status).toBe(400);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("connects only for the cookie's own token and partner, then clears the cookie", async () => {
    mockConnect.mockResolvedValue(1);
    const res = await post({ pageIds: ["1"] });
    expect(res.status).toBe(200);
    expect(mockConnect).toHaveBeenCalledWith(admin, { userToken: "user-token", pageIds: ["1"], clientId: "c1", userId: "u1" });
    expect(mockDelete).toHaveBeenCalledWith({ name: "meta_pick", path: "/api/leads/meta" });
  });

  it("says so when nothing could be connected (keeps the cookie to retry)", async () => {
    mockConnect.mockResolvedValue(0);
    expect((await post({ pageIds: ["2"] })).status).toBe(422);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    mockLimit.mockResolvedValue({ success: false });
    expect((await post({ pageIds: ["1"] })).status).toBe(429);
  });
});
