import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Graph calls go through fetchWithRetry: answer them per path from a table.
let routes: Record<string, unknown> = {};
const calls: string[] = [];
vi.mock("@/lib/http", () => ({
  fetchWithRetry: async (url: string) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v[\d.]+\//, "");
    calls.push(`${path}?${u.searchParams.get("after") ?? ""}`);
    const key = u.searchParams.get("after") ? `${path}#${u.searchParams.get("after")}` : path;
    const body = routes[key];
    if (body === undefined) return new Response(JSON.stringify({ error: { message: `no route ${key}` } }), { status: 400 });
    return new Response(JSON.stringify(body), { status: 200 });
  },
}));
vi.mock("@/lib/leads", () => ({ ingestLead: vi.fn() }));

import { listMetaPages, openMetaPick, sealMetaPick } from "./leads-meta";

const ENV = { id: process.env.META_APP_ID, secret: process.env.META_APP_SECRET };
beforeEach(() => {
  routes = {};
  calls.length = 0;
  process.env.META_APP_ID = "111";
  process.env.META_APP_SECRET = "s3cret";
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  process.env.META_APP_ID = ENV.id;
  process.env.META_APP_SECRET = ENV.secret;
  vi.restoreAllMocks();
});

describe("listMetaPages", () => {
  it("merges /me/accounts with pages picked in the Login for Business dialog", async () => {
    routes["me/accounts"] = { data: [{ id: "1", name: "Beta Page", access_token: "pt1" }] };
    routes["debug_token"] = {
      data: {
        granular_scopes: [
          { scope: "pages_show_list", target_ids: ["1", "2"] },
          { scope: "leads_retrieval", target_ids: ["2"] },
          { scope: "business_management", target_ids: ["999"] }, // a business, not a page
        ],
      },
    };
    routes["2"] = { id: "2", name: "Alpha (business page)", access_token: "pt2" };
    const pages = await listMetaPages("user-token");
    expect(pages.map((p) => [p.id, p.name, !!p.access_token])).toEqual([
      ["2", "Alpha (business page)", true],
      ["1", "Beta Page", true],
    ]);
    expect(calls.some((c) => c.startsWith("999"))).toBe(false);
  });

  it("keeps a granted page without a page token (so the picker can explain)", async () => {
    routes["me/accounts"] = { data: [] };
    routes["debug_token"] = { data: { granular_scopes: [{ scope: "pages_show_list", target_ids: ["7"] }] } };
    routes["7"] = { id: "7", name: "No Task Page" };
    expect(await listMetaPages("t")).toEqual([{ id: "7", name: "No Task Page", access_token: undefined }]);
  });

  it("follows /me/accounts paging and survives a failing debug_token", async () => {
    routes["me/accounts"] = { data: [{ id: "1", name: "A", access_token: "a" }], paging: { cursors: { after: "c1" }, next: "x" } };
    routes["me/accounts#c1"] = { data: [{ id: "2", name: "B", access_token: "b" }] };
    expect((await listMetaPages("t")).map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("drops ids that aren't numeric page ids", async () => {
    routes["me/accounts"] = { data: [{ id: "../me", name: "evil", access_token: "x" }] };
    routes["debug_token"] = { data: { granular_scopes: [{ scope: "pages_show_list", target_ids: ["1/../../me"] }] } };
    expect(await listMetaPages("t")).toEqual([]);
  });
});

describe("Meta pick cookie", () => {
  const who = { userId: "u1", clientId: "c1" };

  it("round-trips for the same user and partner", () => {
    const v = sealMetaPick({ t: "tok", c: "c1", u: "u1" });
    expect(v).not.toContain("tok");
    expect(openMetaPick(v, who)?.t).toBe("tok");
  });

  it("rejects another user, another partner, expiry and tampering", () => {
    const now = Date.now();
    const v = sealMetaPick({ t: "tok", c: "c1", u: "u1" }, now);
    expect(openMetaPick(v, { userId: "u2", clientId: "c1" })).toBeNull();
    expect(openMetaPick(v, { userId: "u1", clientId: "c2" })).toBeNull();
    expect(openMetaPick(v, who, now + 16 * 60_000)).toBeNull();
    const raw = Buffer.from(v, "base64url");
    raw[raw.length - 1] ^= 1;
    expect(openMetaPick(raw.toString("base64url"), who)).toBeNull();
    expect(openMetaPick("garbage", who)).toBeNull();
    expect(openMetaPick(undefined, who)).toBeNull();
  });

  it("can't be opened with another app secret", () => {
    const v = sealMetaPick({ t: "tok", c: "c1", u: "u1" });
    process.env.META_APP_SECRET = "other";
    expect(openMetaPick(v, who)).toBeNull();
  });
});
