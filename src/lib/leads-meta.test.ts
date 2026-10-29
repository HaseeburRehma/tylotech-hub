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
    const b = body as { __error?: unknown; __headers?: Record<string, string> };
    if (b.__error) return new Response(JSON.stringify({ error: b.__error }), { status: 400, headers: b.__headers });
    return new Response(JSON.stringify(body), { status: 200 });
  },
}));
const mockIngest = vi.fn();
vi.mock("@/lib/leads", () => ({ ingestLead: (...a: unknown[]) => mockIngest(...a) }));

import { handleLeadgenEvent, listMetaPages, openMetaPick, sealMetaPick } from "./leads-meta";

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

describe("handleLeadgenEvent", () => {
  const admin: any = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ neq: async () => ({ data: [{ id: "s1", client_id: "c1", access_token: "pt" }] }) }) }) }),
      update: () => ({ eq: async () => ({}) }),
    }),
  };
  beforeEach(() => mockIngest.mockReset().mockResolvedValue({ id: "l1", lead_no: 1 }));

  it("stores the lead with notify on and flags Meta testing-tool leads as test", async () => {
    routes["555"] = { id: "555", created_time: "2026-10-26T15:00:00+0000", form_id: "9", field_data: [{ name: "full_name", values: ["<test lead: dummy data for full_name>"] }] };
    routes["9"] = { name: "Kontaktformular" };
    expect(await handleLeadgenEvent(admin, { leadgen_id: "555", page_id: "77" })).toBe(1);
    expect(mockIngest.mock.calls[0][1]).toMatchObject({ clientId: "c1", source: "meta", externalId: "555", isTest: true, notify: true, form: "Kontaktformular" });
  });

  it("real answers are not test leads", async () => {
    routes["556"] = { id: "556", created_time: "2026-10-26T15:00:00+0000", field_data: [{ name: "full_name", values: ["Max Muster"] }] };
    await handleLeadgenEvent(admin, { leadgen_id: "556", page_id: "77" });
    expect(mockIngest.mock.calls[0][1].isTest).toBe(false);
  });

  it("ignores events without a lead or page id", async () => {
    expect(await handleLeadgenEvent(admin, { page_id: "77" })).toBe(0);
    expect(mockIngest).not.toHaveBeenCalled();
  });
});

describe("syncMetaLeads — 1-minute poll mode", () => {
  const LAST = "2026-10-27T08:00:00.000Z";
  let updates: any[] = [];
  let config: any = {};
  const admin: any = {
    from: () => ({
      select: () => ({ eq: () => ({ neq: async () => ({ data: [{ id: "s1", client_id: "c1", access_token: "pt", external_id: "77", last_synced_at: LAST, config }] }) }) }),
      update: (u: any) => ({ eq: async () => (updates.push(u), {}) }),
    }),
  };
  const sinceOf = () => {
    const c = calls.find((x) => x.startsWith("F1/leads"));
    return c;
  };
  beforeEach(() => {
    updates = [];
    config = {};
    mockIngest.mockReset().mockResolvedValue({ id: "l", lead_no: 1 });
  });

  it("skips archived forms, alerts fresh leads, stores old ones silently", async () => {
    const now = Date.now();
    routes["77/leadgen_forms"] = { data: [{ id: "F1", name: "Live", status: "ACTIVE" }, { id: "F2", name: "Old", status: "ARCHIVED" }] };
    routes["F1/leads"] = {
      data: [
        { id: "fresh", created_time: new Date(now - 60_000).toISOString(), field_data: [] },
        { id: "stale", created_time: new Date(now - 3 * 86_400_000).toISOString(), field_data: [] },
      ],
    };
    const added = await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15, activeFormsOnly: true, notifyMaxAgeMinutes: 24 * 60 });
    expect(added).toBe(2);
    expect(calls.some((c) => c.startsWith("F2/"))).toBe(false);
    const notifyById = Object.fromEntries(mockIngest.mock.calls.map((c) => [c[1].externalId, c[1].notify]));
    expect(notifyById).toEqual({ fresh: true, stale: false });
    expect(sinceOf()).toBeTruthy();
  });

  it("looks back 15 minutes past the last sync and stamps the start time", async () => {
    let filtering = "";
    routes["77/leadgen_forms"] = { data: [{ id: "F1", name: "Live", status: "ACTIVE" }] };
    routes["F1/leads"] = { data: [] };
    const realFetch = (await import("@/lib/http")).fetchWithRetry as any;
    const spy = vi.fn(async (url: string, init: any) => {
      if (url.includes("F1/leads")) filtering = new URL(url).searchParams.get("filtering") ?? "";
      return realFetch(url, init);
    });
    const http = await import("@/lib/http");
    vi.spyOn(http, "fetchWithRetry").mockImplementation(spy as any);
    const before = Date.now();
    await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15, activeFormsOnly: true });
    const since = JSON.parse(filtering)[0].value * 1000;
    expect(since).toBe(new Date(LAST).getTime() - 15 * 60_000);
    expect(new Date(updates[0].last_synced_at).getTime()).toBeGreaterThanOrEqual(before - 5);
    expect(updates[0]).toMatchObject({ status: "active", last_error: null });
  });

  it("doesn't alert twice for a lead the webhook already delivered", async () => {
    routes["77/leadgen_forms"] = { data: [{ id: "F1", name: "Live", status: "ACTIVE" }] };
    routes["F1/leads"] = { data: [{ id: "dup", created_time: new Date().toISOString(), field_data: [] }] };
    mockIngest.mockResolvedValue({ id: "l", lead_no: 1, duplicate: true });
    const added = await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15 });
    expect(added).toBe(0);
  });

  it("marks the source as errored (and moves on) when Meta refuses", async () => {
    routes["77/leadgen_forms"] = undefined as any;
    const added = await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15 });
    expect(added).toBe(0);
    expect(updates[0].status).toBe("error");
  });

  it("rate limited (#80005): backs off as long as Meta says, without turning the source red", async () => {
    routes["77/leadgen_forms"] = {
      __error: { message: "(#80005) There have been too many leadgen api calls to this Page account.", code: 80005 },
      __headers: { "x-business-use-case-usage": JSON.stringify({ "77": [{ type: "leadgen", call_count: 12, estimated_time_to_regain_access: 7 }] }) },
    };
    const t0 = Date.now();
    await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15 });
    expect(updates[0].status).toBe("active");
    expect(updates[0].last_error).toMatch(/rate limit \(#80005\)/);
    expect(updates[0].last_synced_at).toBeUndefined(); // the next window still starts at the last good sync
    const wait = (Date.parse(updates[0].config.retryAt) - t0) / 60_000;
    expect(wait).toBeGreaterThanOrEqual(6.9);
    expect(wait).toBeLessThan(7.5);
    expect(updates[0].config.rateLimitHits).toBe(1);
  });

  it("without Meta's estimate the wait doubles per hit, capped at an hour; other config is kept", async () => {
    routes["77/leadgen_forms"] = { __error: { message: "(#32) Page request limit reached", code: 32 } };
    config = { rateLimitHits: 3, keep: "me" };
    const t0 = Date.now();
    await (await import("./leads-meta")).syncMetaLeads(admin, {});
    expect(Math.round((Date.parse(updates[0].config.retryAt) - t0) / 60_000)).toBe(16);
    expect(updates[0].config).toMatchObject({ rateLimitHits: 4, keep: "me" });
    config = { rateLimitHits: 9 };
    updates = [];
    await (await import("./leads-meta")).syncMetaLeads(admin, {});
    expect(Math.round((Date.parse(updates[0].config.retryAt) - t0) / 60_000)).toBe(60);
  });

  it("while backing off, Meta isn't called at all", async () => {
    config = { retryAt: new Date(Date.now() + 5 * 60_000).toISOString(), rateLimitHits: 1 };
    routes["77/leadgen_forms"] = { data: [] };
    await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15 });
    expect(calls).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("the first good sync after a back-off clears it", async () => {
    config = { retryAt: new Date(Date.now() - 1000).toISOString(), rateLimitHits: 2, keep: 1 };
    routes["77/leadgen_forms"] = { data: [] };
    await (await import("./leads-meta")).syncMetaLeads(admin, { notify: true, overlapMinutes: 15 });
    expect(updates[0]).toMatchObject({ status: "active", last_error: null, config: { keep: 1 } });
    expect(updates[0].config.retryAt).toBeUndefined();
  });

  it("a page synced less than a minute ago isn't asked again (20 s poll)", async () => {
    const recent = new Date(Date.now() - 20_000).toISOString();
    const a: any = { from: () => ({ select: () => ({ eq: () => ({ neq: async () => ({ data: [{ id: "s1", client_id: "c1", access_token: "pt", external_id: "77", last_synced_at: recent, config: {} }] }) }) }), update: () => ({ eq: async () => ({}) }) }) };
    routes["77/leadgen_forms"] = { data: [] };
    await (await import("./leads-meta")).syncMetaLeads(a, { minIntervalMs: 50_000 });
    expect(calls).toEqual([]);
    await (await import("./leads-meta")).syncMetaLeads(a, {});
    expect(calls.some((c) => c.startsWith("77/leadgen_forms"))).toBe(true);
  });

  it("pages run side by side: a broken page doesn't stop the others", async () => {
    const ups: any[] = [];
    const a: any = {
      from: () => ({
        select: () => ({ eq: () => ({ neq: async () => ({ data: [
          { id: "bad", client_id: "c1", access_token: "pt", external_id: "66", last_synced_at: LAST, config: {} },
          { id: "good", client_id: "c2", access_token: "pt", external_id: "77", last_synced_at: LAST, config: {} },
        ] }) }) }),
        update: (u: any) => ({ eq: async (_k: string, id: string) => (ups.push({ id, ...u }), {}) }),
      }),
    };
    routes["66/leadgen_forms"] = { __error: { message: "Error validating access token", code: 190 } };
    routes["77/leadgen_forms"] = { data: [{ id: "F1", name: "Live", status: "ACTIVE" }] };
    routes["F1/leads"] = { data: [{ id: "L1", created_time: new Date().toISOString(), field_data: [{ name: "full_name", values: ["Erika"] }] }] };
    const added = await (await import("./leads-meta")).syncMetaLeads(a, { notify: true, overlapMinutes: 15 });
    expect(added).toBe(1);
    expect(ups.find((u) => u.id === "bad")).toMatchObject({ status: "error" });
    expect(ups.find((u) => u.id === "good")).toMatchObject({ status: "active" });
  });

  it("a non-throttling error still marks the source as errored", async () => {
    routes["77/leadgen_forms"] = { __error: { message: "Error validating access token", code: 190 } };
    await (await import("./leads-meta")).syncMetaLeads(admin, {});
    expect(updates[0]).toMatchObject({ status: "error", last_error: "Error validating access token" });
    expect(updates[0].config).toBeUndefined();
  });
});
