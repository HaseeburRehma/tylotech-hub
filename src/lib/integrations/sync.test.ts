import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMeta = vi.fn();
vi.mock("@/lib/integrations/meta-ads-adapter", () => ({ fetchMetaAdsKpis: (...a: unknown[]) => fetchMeta(...a) }));
vi.mock("@/lib/integrations/fetchers", () => ({ fetchGa4: vi.fn(), fetchGoogleAds: vi.fn(), fetchSearchConsole: vi.fn(), findGoogleAdsManager: vi.fn(), isFetchError: (d: any) => !!d && "error" in d }));
vi.mock("@/lib/integrations/oauth", () => ({ refreshGoogleAccessToken: async () => null }));
vi.mock("@/lib/notify", () => ({ notifyClientUsers: vi.fn() }));
vi.mock("@/lib/live-feed", () => ({ CHANNEL_LABEL: {}, emitActivity: vi.fn(), joinDetail: vi.fn(), leadsTitle: vi.fn() }));

import { dropSourceKpis, syncClient } from "./sync";

const DAY = 86_400_000;
let db: Record<string, any[]>;
function q(table: string) {
  const f: ((r: any) => boolean)[] = [];
  let op = "select";
  let payload: any;
  const api: any = {
    select: () => api,
    delete: () => ((op = "delete"), api),
    update: (p: any) => ((op = "update"), (payload = p), api),
    insert: (p: any) => ((op = "insert"), (payload = p), api),
    eq: (k: string, v: unknown) => (f.push((r) => r[k] === v), api),
    neq: (k: string, v: unknown) => (f.push((r) => r[k] !== v), api),
    lt: (k: string, v: string) => (f.push((r) => r[k] < v), api),
    not: () => api,
    maybeSingle: () => api,
    then: (res: any) => {
      const rows = (db[table] ??= []);
      const hit = rows.filter((r) => f.every((x) => x(r)));
      if (op === "delete") db[table] = rows.filter((r) => !hit.includes(r));
      if (op === "update") hit.forEach((r) => Object.assign(r, payload));
      return Promise.resolve({ data: table === "clients" ? hit[0] ?? null : hit, error: null }).then(res);
    },
  };
  return api;
}
const admin: any = { from: (t: string) => q(t) };
const kpi = (source: string, ageDays: number) => ({ client_id: "c1", source, label: "x", created_at: new Date(Date.now() - ageDays * DAY).toISOString() });

beforeEach(() => {
  fetchMeta.mockReset();
  db = {
    clients: [{ id: "c1", archived_at: null }],
    integrations: [],
    kpis: [kpi("Meta Ads", 5), kpi("Search Console", 12), kpi("GA4", 1), kpi("Manual", 100)],
  };
});

describe("stale KPIs", () => {
  it("dropSourceKpis: only that source, optionally only old rows; manual numbers stay", async () => {
    await dropSourceKpis(admin, "c1", "meta_ads", 72 * 3_600_000);
    expect(db.kpis.map((k) => k.source)).toEqual(["Search Console", "GA4", "Manual"]);
    await dropSourceKpis(admin, "c1", "ga4");
    expect(db.kpis.map((k) => k.source)).toEqual(["Search Console", "Manual"]);
    await dropSourceKpis(admin, "c1", "unknown");
    expect(db.kpis).toHaveLength(2);
  });

  it("a source whose sign-in broke (or was disconnected) shows no old numbers after the next sync", async () => {
    db.integrations = [{ client_id: "c1", provider: "search_console", status: "error" }];
    await syncClient(admin, "c1");
    expect(db.kpis.map((k) => k.source)).toEqual(["Meta Ads", "GA4", "Manual"]);
  });

  it("a passing API hiccup keeps fresh numbers; after 72 h without data they go", async () => {
    db.integrations = [{ id: "i1", client_id: "c1", provider: "meta_ads", status: "connected", access_token: "t", meta: { accountId: "act_1" } }];
    fetchMeta.mockResolvedValue({ error: "api", detail: "Service temporarily unavailable" });
    db.kpis = [kpi("Meta Ads", 1)];
    await syncClient(admin, "c1");
    expect(db.kpis).toHaveLength(1);
    db.kpis = [kpi("Meta Ads", 4)];
    await syncClient(admin, "c1");
    expect(db.kpis).toHaveLength(0);
  });

  it("a rejected token drops the source's numbers at once", async () => {
    db.integrations = [{ id: "i1", client_id: "c1", provider: "meta_ads", status: "connected", access_token: "t", meta: { accountId: "act_1" } }];
    fetchMeta.mockResolvedValue({ error: "auth" });
    db.kpis = [kpi("Meta Ads", 0.1)];
    await syncClient(admin, "c1");
    expect(db.kpis).toHaveLength(0);
  });

  it("no activity in the window: old cards go once they are 72 h old", async () => {
    db.integrations = [{ id: "i1", client_id: "c1", provider: "meta_ads", status: "connected", access_token: "t", meta: { accountId: "act_1" } }];
    fetchMeta.mockResolvedValue(null);
    db.kpis = [kpi("Meta Ads", 1), kpi("Meta Ads", 10)];
    await syncClient(admin, "c1");
    expect(db.kpis).toHaveLength(1);
  });

  it("a card marked connected without any sign-in is flagged, not shown as connected", async () => {
    db.integrations = [{ id: "i1", client_id: "c1", provider: "google_ads", status: "connected", access_token: null, refresh_token: null, meta: { accountId: "724-877-0862" } }];
    db.kpis = [kpi("Google Ads", 1)];
    const r = await syncClient(admin, "c1");
    expect(db.integrations[0]).toMatchObject({ status: "error", meta: { accountId: "724-877-0862", lastError: "auth" } });
    expect(db.kpis).toHaveLength(0);
    expect(r.results[0].reason).toMatch(/not signed in/);
  });
});

