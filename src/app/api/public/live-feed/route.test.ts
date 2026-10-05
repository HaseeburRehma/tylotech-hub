import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/* The admin client is mocked (vi.mock is hoisted above the import) so the auth and
   filter rules can be tested without a database. */
const query = vi.hoisted(() => ({
  filters: [] as [string, string, unknown][],
  select() { return this; },
  eq(col: string, v: unknown) { this.filters.push(["eq", col, v]); return this; },
  is(col: string, v: unknown) { this.filters.push(["is", col, v]); return this; },
  gt(col: string, v: unknown) { this.filters.push(["gt", col, v]); return this; },
  order() { return this; },
  limit: async () => ({
    data: [{ id: "e1", kind: "query", title: "Neue Anfrage über Google", detail: "Fahrschule · Düsseldorf", occurred_at: new Date().toISOString() }],
    error: null,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => query }) }));

const call = (headers: Record<string, string> = {}, url = "https://hq.test/api/public/live-feed") => GET(new Request(url, { headers }));

describe("GET /api/public/live-feed", () => {
  beforeEach(() => {
    process.env.LIVE_FEED_TOKEN = "s3cret-token-value";
    query.filters = [];
  });
  afterEach(() => {
    delete process.env.LIVE_FEED_TOKEN;
  });

  it("503 when LIVE_FEED_TOKEN is unset", async () => {
    delete process.env.LIVE_FEED_TOKEN;
    expect((await call({ authorization: "Bearer x" })).status).toBe(503);
  });

  it("401 without or with a wrong token, and ?key= is not accepted", async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call({}, "https://hq.test/api/public/live-feed?key=s3cret-token-value")).status).toBe(401);
  });

  it("200 with a valid token, no-store, only opted-in, visible, non-archived clients", async () => {
    const res = await call({ authorization: "Bearer s3cret-token-value" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(Object.keys(body.events[0]).sort()).toEqual(["detail", "id", "kind", "occurredAt", "title"]);
    expect(query.filters).toContainEqual(["eq", "hidden", false]);
    expect(query.filters).toContainEqual(["eq", "clients.public_feed_opt_in", true]);
    expect(query.filters).toContainEqual(["is", "clients.archived_at", null]);
  });
});
