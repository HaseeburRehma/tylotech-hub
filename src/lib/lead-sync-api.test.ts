import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockIngest = vi.fn();
vi.mock("@/lib/leads", () => ({ ingestLead: (...a: unknown[]) => mockIngest(...a) }));
vi.mock("@/lib/integrations/oauth", () => ({ refreshGoogleAccessToken: async () => "gtoken" }));

import { apiProviderOf, googleAdsLead, hubspotLead, pipedriveLead, syncApiLeadSources } from "./lead-sync-api";
import { pickContact } from "./leads-shared";

describe("mapping", () => {
  it("HubSpot contact → lead (German labels, form, paid social → facebook)", () => {
    const l = hubspotLead({ id: "101", properties: { firstname: "Erika", lastname: "Muster", email: "erika@example.de", phone: "+49 170 1", createdate: "2026-10-29T08:00:00Z", recent_conversion_event_name: "Kontaktformular", hs_analytics_source: "PAID_SOCIAL", hs_analytics_source_data_1: "Facebook", hs_analytics_source_data_2: "Herbst" } });
    expect(l).toMatchObject({ source: "webhook", externalId: "hubspot:101", createdAt: "2026-10-29T08:00:00Z", form: "Kontaktformular", platform: "facebook", campaign: "Herbst" });
    expect(pickContact(l.fields)).toEqual({ name: "Erika Muster", email: "erika@example.de", phone: "+49 170 1" });
  });
  it("Pipedrive lead + person → lead (primary email/phone)", () => {
    const l = pipedriveLead({ id: "abc", title: "Anfrage Bad", add_time: "2026-10-29T07:00:00.000Z", source_name: "Web forms", value: { amount: 5000, currency: "EUR" } }, { name: "Max Probe", email: [{ value: "alt@example.de" }, { value: "max@example.de", primary: true }], phone: [{ value: "0170 2", primary: true }] });
    expect(l).toMatchObject({ externalId: "pipedrive:abc", form: "Web forms", platform: "pipedrive" });
    expect(pickContact(l.fields)).toEqual({ name: "Max Probe", email: "max@example.de", phone: "0170 2" });
    expect(l.fields).toContainEqual({ label: "Wert", value: "5000 EUR" });
  });
  it("Google Ads lead form row → lead (ids for campaign matching, custom questions, form name)", () => {
    const names = new Map([["customers/1/assets/77", "Kostenlose Beratung"]]);
    const l = googleAdsLead(
      {
        leadFormSubmissionData: {
          id: "gid-1",
          campaign: "customers/1/campaigns/2233",
          adGroup: "customers/1/adGroups/4455",
          adGroupAd: "customers/1/adGroupAds/4455~6677",
          asset: "customers/1/assets/77",
          gclid: "Cj0KCQ-test",
          submissionDateTime: "2026-10-29 10:12:45+01:00",
          leadFormSubmissionFields: [{ fieldType: "FULL_NAME", fieldValue: "Lena Beispiel" }, { fieldType: "EMAIL", fieldValue: "lena@example.de" }, { fieldType: "PHONE_NUMBER", fieldValue: "+491511" }],
          customLeadFormSubmissionFields: [{ questionText: "Wann sollen wir anrufen?", fieldValue: "Abends" }],
        },
      },
      names,
    )!;
    expect(l).toMatchObject({ source: "google_ads", externalId: "gid-1", createdAt: "2026-10-29T10:12:45+01:00", campaign: "2233", adGroup: "4455", ad: "6677", form: "Kostenlose Beratung", platform: "google" });
    expect(Date.parse(l.createdAt!)).toBe(Date.UTC(2026, 9, 29, 9, 12, 45));
    expect(pickContact(l.fields)).toEqual({ name: "Lena Beispiel", email: "lena@example.de", phone: "+491511" });
    expect(l.fields).toContainEqual({ label: "Wann sollen wir anrufen?", value: "Abends" });
  });
  it("which sources are fetched by us", () => {
    expect(apiProviderOf({ kind: "webhook", config: { provider: "hubspot" } })).toBe("hubspot");
    expect(apiProviderOf({ kind: "google_ads", config: { mode: "api" } })).toBe("google_ads");
    expect(apiProviderOf({ kind: "google_ads", config: {} })).toBeNull();
    expect(apiProviderOf({ kind: "webhook", config: { provider: "typeform" } })).toBeNull();
  });
});

describe("syncApiLeadSources", () => {
  let rows: any[] = [];
  let updates: any[] = [];
  let fetchCalls: string[] = [];
  let respond: (url: string) => { status: number; body: unknown };
  const admin: any = {
    from: (t: string) => {
      if (t === "integrations") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "connected", refresh_token: "r", meta: { accountId: "123-456-7890" } } }) }) }) }) };
      const chain: any = {
        select: () => chain,
        in: () => chain,
        neq: () => chain,
        eq: () => chain,
        then: (res: any) => res({ data: rows }),
        update: (u: any) => ({ eq: async (_k: string, id: string) => (updates.push({ id, ...u }), {}) }),
      };
      return chain;
    },
  };
  const hs = (id: string, created: string) => ({ id, properties: { firstname: "N" + id, email: `${id}@example.de`, createdate: created, recent_conversion_event_name: "Form" } });

  beforeEach(() => {
    updates = [];
    fetchCalls = [];
    mockIngest.mockReset().mockResolvedValue({ id: "l", lead_no: 1 });
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev";
    respond = () => ({ status: 200, body: { results: [] } });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push(`${init?.method ?? "GET"} ${url}`);
      const r = respond(url);
      return new Response(JSON.stringify(r.body), { status: r.status });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("HubSpot first import: last 30 days, stored quietly, then marked imported", async () => {
    rows = [{ id: "s1", client_id: "c1", kind: "webhook", access_token: "pat-1", last_synced_at: null, config: { provider: "hubspot" } }];
    respond = () => ({ status: 200, body: { results: [hs("1", new Date().toISOString()), hs("2", new Date().toISOString())] } });
    const added = await syncApiLeadSources(admin);
    expect(added).toBe(2);
    expect(mockIngest.mock.calls.every((c) => c[1].notify === false)).toBe(true);
    expect(mockIngest.mock.calls[0][1]).toMatchObject({ clientId: "c1", sourceId: "s1", externalId: "hubspot:1" });
    expect(updates[0]).toMatchObject({ id: "s1", status: "active", last_error: null });
    expect(updates[0].config.importedAt).toBeTruthy();
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(Number(body.filterGroups[0].filters[0].value)).toBeLessThan(Date.now() - 29 * 86_400_000);
  });

  it("after the import: fresh leads alert, old ones don't, window = last sync − 10 min", async () => {
    const last = new Date(Date.now() - 5 * 60_000).toISOString();
    rows = [{ id: "s1", client_id: "c1", kind: "webhook", access_token: "pat-1", last_synced_at: last, config: { provider: "hubspot", importedAt: "2026-10-01T00:00:00Z" } }];
    respond = () => ({ status: 200, body: { results: [hs("3", new Date().toISOString()), hs("4", "2026-09-01T00:00:00Z")] } });
    await syncApiLeadSources(admin);
    expect(mockIngest.mock.calls.map((c) => c[1].notify)).toEqual([true, false]);
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(Number(body.filterGroups[0].filters[0].value)).toBe(Date.parse(last) - 10 * 60_000);
  });

  it("asked less than a minute ago: not asked again", async () => {
    rows = [{ id: "s1", client_id: "c1", kind: "webhook", access_token: "pat-1", last_synced_at: new Date().toISOString(), config: { provider: "hubspot", importedAt: "x" } }];
    await syncApiLeadSources(admin, { minIntervalMs: 50_000 });
    expect(fetchCalls).toEqual([]);
  });

  it("a refused token turns the source red with a clear message; throttling only waits", async () => {
    rows = [
      { id: "bad", client_id: "c1", kind: "webhook", access_token: "pat-x", last_synced_at: null, config: { provider: "hubspot" } },
      { id: "busy", client_id: "c2", kind: "webhook", access_token: "pd-x", last_synced_at: null, config: { provider: "pipedrive" } },
    ];
    respond = (url) => (url.includes("hubapi") ? { status: 401, body: { message: "Authentication credentials not found" } } : { status: 429, body: { error: "Rate limit" } });
    await syncApiLeadSources(admin);
    expect(updates.find((u) => u.id === "bad")).toMatchObject({ status: "error", last_error: expect.stringMatching(/abgelaufen/) });
    const busy = updates.find((u) => u.id === "busy");
    expect(busy.status).toBeUndefined();
    expect(Date.parse(busy.config.retryAt)).toBeGreaterThan(Date.now());
  });

  it("Pipedrive: only leads since the window, hand-typed ones skipped, person looked up", async () => {
    rows = [{ id: "p1", client_id: "c1", kind: "webhook", access_token: "pd-1", last_synced_at: new Date(Date.now() - 120_000).toISOString(), config: { provider: "pipedrive", importedAt: "x" } }];
    respond = (url) =>
      url.includes("/leads?")
        ? { status: 200, body: { data: [{ id: "L1", add_time: new Date().toISOString(), person_id: 9, source_name: "Web forms" }, { id: "L2", add_time: new Date().toISOString(), source_name: "Manually created" }, { id: "L0", add_time: "2026-01-01T00:00:00.000Z" }], additional_data: { pagination: { more_items_in_collection: true } } } }
        : { status: 200, body: { data: { name: "Max", email: [{ value: "max@example.de", primary: true }] } } };
    const added = await syncApiLeadSources(admin);
    expect(added).toBe(1);
    expect(mockIngest.mock.calls[0][1]).toMatchObject({ externalId: "pipedrive:L1", notify: true });
    expect(fetchCalls.filter((c) => c.includes("/leads?"))).toHaveLength(1); // older leads reached: no second page
    expect(fetchCalls.some((c) => c.includes("/persons/9"))).toBe(true);
    expect(fetchCalls.every((c) => c.startsWith("GET https://api.pipedrive.com/"))).toBe(true);
  });

  it("Google Ads: uses the partner's account; no developer token → clear error", async () => {
    rows = [{ id: "g1", client_id: "c1", kind: "google_ads", access_token: null, last_synced_at: null, config: { mode: "api" } }];
    respond = () => ({ status: 200, body: [{ results: [{ leadFormSubmissionData: { id: "x1", submissionDateTime: "2026-10-29 10:00:00+01:00", leadFormSubmissionFields: [{ fieldType: "EMAIL", fieldValue: "a@example.de" }] } }] }] });
    expect(await syncApiLeadSources(admin)).toBe(1);
    expect(fetchCalls[0]).toContain("/customers/1234567890/googleAds:searchStream");
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    updates = [];
    await syncApiLeadSources(admin);
    expect(updates[0]).toMatchObject({ status: "error" });
  });
});
