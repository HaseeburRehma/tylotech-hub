import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const alerts: { id: string; name: string | null }[] = [];
vi.mock("@/lib/lead-alerts", () => ({ alertNewLead: vi.fn(async (_a: unknown, lead: { id: string; name: string | null }) => void alerts.push(lead)) }));
vi.mock("@/lib/background", () => ({ inBackground: (_l: string, task: () => Promise<unknown>) => task() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), isStaff: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
const refresh = vi.fn(async (t: string) => (t === "rt-ok" ? "at-ok" : null));
vi.mock("@/lib/integrations/oauth", () => ({ refreshGoogleAccessToken: (t: string) => refresh(t) }));
const clickLookup = vi.fn();
vi.mock("@/lib/integrations/campaigns", () => ({ googleClickAttribution: (...a: unknown[]) => clickLookup(...a) }));

import { sheetDateZone, syncSheetLeads, syncSheetSource, type SheetConfig } from "./leads-sheets";

/* ── A small in-memory stand-in for the Supabase query builder ── */
type Row = Record<string, any>;
let db: Record<string, Row[]>;
let seq = 0;
function q(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" = "select";
  let payload: any = null;
  let one = false;
  const api: any = {
    select: () => api,
    insert: (rows: Row | Row[]) => ((op = "insert"), (payload = Array.isArray(rows) ? rows : [rows]), api),
    update: (p: Row) => ((op = "update"), (payload = p), api),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), api),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), api),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), api),
    order: () => api,
    limit: () => api,
    maybeSingle: () => ((one = true), api),
    single: () => ((one = true), api),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
  };
  function run() {
    const rows = (db[table] ??= []);
    if (op === "insert") {
      if (table === "leads") {
        const clash = payload.some((p: Row) => p.external_id && rows.some((r) => r.client_id === p.client_id && r.source === p.source && r.external_id === p.external_id));
        if (clash) return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const made = payload.map((p: Row) => {
        const r: Row = { id: `${table}-${++seq}`, email: null, phone: null, name: null, tags: [], ...p };
        if (table === "leads") r.lead_no = rows.filter((x) => x.client_id === p.client_id).length + 1;
        rows.push(r);
        return r;
      });
      return { data: one ? structuredClone(made[0]) : structuredClone(made), error: null };
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") hit.forEach((r) => Object.assign(r, payload));
    // Like the real client: copies, not the stored rows.
    const out = hit.map((r) => structuredClone(r));
    return { data: one ? out[0] ?? null : out, error: null };
  }
  return api;
}
const admin: any = { from: (t: string) => q(t) };

/* ── The sheet ── */
const CLIENT = "c-loh";
const HEAD_ALL = ["", "Zeitstempel", "Status", "Vorname", "Nachname", "Telefon", "Email", "Frage1_Themen"];
let tabs: Record<string, unknown[][]>;
function sheetWith(allRows: unknown[][]) {
  tabs = {
    "Google leads updated": [
      ["Datum", "Vorname", "Nachname", "Telefon", "Email", "LeadID"],
      ["27.10.2026, 09:16:39", "Erika", "Muster", "0151 2345678", "erika@example.de", "lead_erika_0000001"],
      ["20.10.2026, 08:00:00", "Max", "Alt", "0170 1111111", "max@example.de", "lead_max_000000001"],
    ],
    "Leads (inkl. Teil)": [HEAD_ALL, ...allRows],
    "Retreat Leads": [
      ["LeadID", "Zeitstempel", "Status", "Letzter Schritt", "Vorname", "E-Mail"],
      ["retreat-0000000000001", "2026-10-27 11:10:20", "Teil-Bewerbung", "10", "Lena", "lena@example.de"],
    ],
  };
}
const JONAS_PARTIAL = ["lead_jonas_00000001", "2026-10-26 11:49:01", "Teil-Lead", "Jonas", "", "0160 2222222", "", "Depression"];
const ANON = ["lead_anon_000000001", "2026-10-27 11:00:00", "Teil-Lead (anonym)", "", "", "", "", "Stress"];

const fetchMock = vi.fn(async (url: string) => {
  const u = new URL(url);
  const ranges = u.searchParams.getAll("ranges");
  const valueRanges = ranges.map((r) => ({ values: tabs[r.replace(/^'(.*)'!.*$/, "$1").replace(/''/g, "'")] ?? [] }));
  return new Response(JSON.stringify({ valueRanges }), { status: 200 });
});

function source(cfg: Partial<SheetConfig> = {}, token = "rt-ok") {
  const s = { id: "src-1", client_id: CLIENT, kind: "google_sheet", status: "active", external_id: "sheet-1", access_token: token, config: { tabs: Object.keys(tabs), timeZone: "Europe/Berlin", ...cfg } as SheetConfig };
  db.lead_sources = [s];
  return s;
}
const cfgNow = () => db.lead_sources[0].config as SheetConfig;
const lead = (ext: string) => db.leads.find((l) => l.external_id === ext)!;

beforeEach(() => {
  db = { leads: [], lead_activities: [], lead_sources: [] };
  alerts.length = 0;
  seq = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T10:30:00Z"));
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  sheetWith([JONAS_PARTIAL, ANON]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("syncSheetSource", () => {
  it("first import: every row once, merged by lead id, alerts only for fresh leads with contact", async () => {
    const r = await syncSheetSource(admin, source());
    expect(r).toMatchObject({ added: 5, updated: 0, pending: 0 });
    expect(db.leads.map((l) => l.external_id).sort()).toEqual(["lead_anon_000000001", "lead_erika_0000001", "lead_jonas_00000001", "lead_max_000000001", "retreat-0000000000001"]);
    // Erika (this morning) and Lena (retreat, 20 min ago) alert; Max is a week old,
    // Jonas is from yesterday, the anonymous partial has no contact.
    expect(alerts.map((a) => a.name).sort()).toEqual(["Erika Muster", "Lena"]);
    expect(lead("lead_jonas_00000001").tags).toEqual(["Teil-Lead"]);
    expect(lead("retreat-0000000000001").tags).toEqual(["Retreat", "Teil-Bewerbung"]);
    expect(lead("lead_erika_0000001").source).toBe("webhook");
    // Lead numbers follow the time the forms were sent.
    expect(lead("lead_max_000000001").lead_no).toBe(1);
    expect(Object.keys(cfgNow().hashes ?? {})).toHaveLength(5);
    expect(cfgNow().importedAt).toBeTruthy();
    expect(db.lead_sources[0].status).toBe("active");
    expect(db.lead_activities.filter((a) => a.kind === "created")).toHaveLength(5);
  });

  it("unchanged sheet: nothing written, nothing alerted", async () => {
    await syncSheetSource(admin, source());
    alerts.length = 0;
    const before = JSON.stringify(db.leads);
    const r = await syncSheetSource(admin, ({ ...db.lead_sources[0] } as any));
    expect(r).toMatchObject({ added: 0, updated: 0, alerted: 0 });
    expect(JSON.stringify(db.leads)).toBe(before);
    expect(alerts).toHaveLength(0);
  });

  it("a partial that finishes is updated in place; a lead that first gets a phone alerts once", async () => {
    await syncSheetSource(admin, source());
    alerts.length = 0;
    sheetWith([
      ["lead_jonas_00000001", "2026-10-26 11:49:01", "Vollständig", "Jonas", "Weber", "0160 2222222", "jonas@example.de", "Depression"],
      ["lead_anon_000000001", "2026-10-27 11:00:00", "Teil-Lead", "Ana", "", "0171 3333333", "", "Stress"],
    ]);
    const r1 = await syncSheetSource(admin, ({ ...db.lead_sources[0] } as any));
    expect(r1).toMatchObject({ added: 0, updated: 2 });
    expect(db.leads).toHaveLength(5);
    const jonas = lead("lead_jonas_00000001");
    expect(jonas.tags).toEqual(["Vollständig"]);
    expect(jonas.email).toBe("jonas@example.de");
    expect(db.lead_activities.some((a) => a.lead_id === jonas.id && a.kind === "edit")).toBe(true);
    // Jonas already had a phone → no new alert. Ana just left one → alert.
    expect(alerts.map((a) => a.name)).toEqual(["Ana"]);
    // Running again (or a parallel run) doesn't alert Ana twice.
    db.lead_sources[0].config = { ...cfgNow(), hashes: {} };
    await syncSheetSource(admin, ({ ...db.lead_sources[0] } as any));
    expect(alerts).toHaveLength(1);
  });

  it("two runs at the same time: no duplicate leads, no duplicate alerts", async () => {
    const s = source();
    await Promise.all([syncSheetSource(admin, { ...s }), syncSheetSource(admin, { ...s })]);
    expect(db.leads).toHaveLength(5);
    expect(new Set(db.leads.map((l) => l.lead_no)).size).toBe(5);
    expect(alerts).toHaveLength(2);
  });

  it("a revoked Google grant marks the source, without throwing", async () => {
    const r = await syncSheetSource(admin, source({}, "rt-revoked"));
    expect(r.error).toMatch(/Google-Zugriff/);
    expect(db.lead_sources[0].status).toBe("error");
    expect(db.leads).toHaveLength(0);
  });

  it("a renamed tab (Google 400) is reported as such", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "Unable to parse range: 'Alt'!A1:CZ5000" } }), { status: 400 }));
    const r = await syncSheetSource(admin, source());
    expect(r.error).toMatch(/Tab fehlt/);
  });

  it("over the time budget: stops, keeps the rest for the next run, alerts nothing old", async () => {
    const big = Array.from({ length: 400 }, (_, i) => [`lead_bulk_${String(i).padStart(8, "0")}`, "2026-10-01 10:00:00", "Teil-Lead", `P${i}`, "", `0151 ${i}`, "", "x"]);
    sheetWith(big);
    const r = await syncSheetSource(admin, source(), { budgetMs: -1 });
    expect(r.added).toBe(0);
    expect(r.pending).toBeGreaterThan(400);
    expect(cfgNow().importedAt).toBeUndefined();
    const r2 = await syncSheetSource(admin, ({ ...db.lead_sources[0] } as any));
    expect(r2.pending).toBe(0);
    expect(db.leads).toHaveLength(403);
    expect(new Set(db.leads.map((l) => l.external_id)).size).toBe(403);
    expect(alerts.map((a) => a.name).sort()).toEqual(["Erika Muster", "Lena"]);
  });

  it("no tabs chosen yet: nothing is read", async () => {
    const r = await syncSheetSource(admin, source({ tabs: [] }));
    expect(r).toMatchObject({ added: 0, updated: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("syncSheetLeads", () => {
  it("reads every connected sheet source", async () => {
    source();
    const r = await syncSheetLeads(admin);
    expect(r.added).toBe(5);
  });
});

describe("Google clicks → campaign and ad group", () => {
  const HEAD = ["LeadID", "Zeitstempel", "Vorname", "Telefon", "gclid", "Seite", "utm_campaign", "utm_term", "utm_content"];
  const G1 = "Cj0KCQjwAAAAAAAAAAAAAAAAAAAA1";
  const G2 = "Cj0KCQjwBBBBBBBBBBBBBBBBBBBB2";
  const G3 = "Cj0KCQjwCCCCCCCCCCCCCCCCCCCC3";
  // Which (day, gclid) Google Ads knows.
  let known: Record<string, Record<string, { campaignId: string; adGroupId: string }>>;
  let failDays: Set<string>;
  beforeEach(() => {
    tabs = {
      Leads: [
        HEAD,
        ["lead_a_00000000001", "2026-10-27 11:00:00", "Anna", "0151 1", G1, "/tt-online", "", "", ""],
        ["lead_b_00000000001", "2026-10-26 12:00:00", "Ben", "0151 2", G2, "/keinewartezeit", "", "", ""],
        ["lead_c_00000000001", "2026-10-25 09:00:00", "Cem", "0151 3", G3, "https://lightofhope.foundation/tt-online?gad_source=1&gad_campaignid=24145005768&gclid=x", "", "", ""],
        ["lead_d_00000000001", "2026-10-27 08:00:00", "Dana", "0151 4", "", "/lebensretreat", "120255826547290348", "120255826547300348", "120255859650460348"],
      ],
    };
    known = { "2026-10-27": { [G1]: { campaignId: "111", adGroupId: "222" } }, "2026-10-24": { [G3]: { campaignId: "24145005768", adGroupId: "333" } } };
    failDays = new Set();
    clickLookup.mockReset().mockImplementation(async (_t: string, _c: string, _l: string, day: string, ids: string[]) => {
      if (failDays.has(day)) return { error: "Google Ads request failed." };
      return { clicks: new Map(ids.filter((g) => known[day]?.[g]).map((g) => [g, known[day][g]])) };
    });
    db.integrations = [{ client_id: CLIENT, provider: "google_ads", status: "connected", refresh_token: "rt-ok", meta: { accountId: "185-986-0474", loginCustomerId: "132-838-6899" } }];
  });

  it("resolves gclids to campaign + ad group ids (lead day and the day before), keeps utm and gad ids", async () => {
    await syncSheetSource(admin, source());
    expect(lead("lead_a_00000000001")).toMatchObject({ campaign: "111", ad_group: "222", platform: "google" });
    expect(lead("lead_b_00000000001")).toMatchObject({ campaign: null, ad_group: null });
    // Campaign from the landing page URL, ad group from the click (clicked the evening before).
    expect(lead("lead_c_00000000001")).toMatchObject({ campaign: "24145005768", ad_group: "333" });
    expect(lead("lead_d_00000000001")).toMatchObject({ campaign: "120255826547290348", ad_group: "120255826547300348", ad: "120255859650460348" });
    const days = clickLookup.mock.calls.map((c) => c[3]).sort();
    expect(days).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(clickLookup.mock.calls[0].slice(0, 3)).toEqual(["at-ok", "185-986-0474", "132-838-6899"]);
    const c = cfgNow().clicks!;
    expect(c["lead_a_00000000001"]).toBe("111|222");
    expect(c["lead_b_00000000001"]).toMatch(/^\?2026-10-27T10:30/);
    expect(c["lead_d_00000000001"]).toBeUndefined();
    // The click id itself is never stored as an answer.
    expect(JSON.stringify(db.leads)).not.toContain(G1);
  });

  it("asks Google once per lead; a miss is retried after 3 h while the lead is under 3 days old", async () => {
    await syncSheetSource(admin, source());
    clickLookup.mockClear();
    await syncSheetSource(admin, db.lead_sources[0] as any);
    expect(clickLookup).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-10-27T14:00:00Z"));
    known["2026-10-26"] = { [G2]: { campaignId: "444", adGroupId: "555" } };
    await syncSheetSource(admin, db.lead_sources[0] as any);
    expect(clickLookup.mock.calls.map((c) => c[4]).flat()).toEqual([G2, G2]);
    expect(lead("lead_b_00000000001")).toMatchObject({ campaign: "444", ad_group: "555" });
  });

  it("gives up on a click after 3 days", async () => {
    known = {};
    await syncSheetSource(admin, source());
    clickLookup.mockClear();
    vi.setSystemTime(new Date("2026-10-31T10:30:00Z"));
    await syncSheetSource(admin, db.lead_sources[0] as any);
    expect(clickLookup).not.toHaveBeenCalled();
  });

  it("a failed Google day isn't a miss: those leads are asked again next run", async () => {
    failDays = new Set(["2026-10-26"]);
    await syncSheetSource(admin, source());
    const c = cfgNow().clicks!;
    expect(c["lead_a_00000000001"]).toBe("111|222");
    expect(c["lead_b_00000000001"]).toBeUndefined();
    failDays.clear();
    clickLookup.mockClear();
    await syncSheetSource(admin, db.lead_sources[0] as any);
    expect(clickLookup.mock.calls.length).toBeGreaterThan(0);
    expect(cfgNow().clicks!["lead_b_00000000001"]).toMatch(/^\?/);
  });

  it("without a connected Google Ads account nothing is looked up, leads still arrive", async () => {
    db.integrations = [];
    const r = await syncSheetSource(admin, source());
    expect(clickLookup).not.toHaveBeenCalled();
    expect(r.added).toBe(4);
    expect(lead("lead_a_00000000001")).toMatchObject({ campaign: null, platform: "google" });
  });

  it("a found campaign updates a lead imported before the lookup (once)", async () => {
    db.integrations = [];
    await syncSheetSource(admin, source());
    expect(lead("lead_a_00000000001").campaign).toBeNull();
    db.integrations = [{ client_id: CLIENT, provider: "google_ads", status: "connected", refresh_token: "rt-ok", meta: { accountId: "185-986-0474" } }];
    const r = await syncSheetSource(admin, db.lead_sources[0] as any);
    expect(lead("lead_a_00000000001")).toMatchObject({ campaign: "111", ad_group: "222" });
    expect(r.updated).toBe(2); // A and C got their ad groups
    expect(alerts.filter((a) => a.name === "Anna")).toHaveLength(1);
  });
});

describe("sheetDateZone", () => {
  const serial = (ms: number) => 25569 + ms / 86_400_000;
  const head = ["Zeitstempel", "Vorname", "Telefon"];
  const now = Date.UTC(2026, 9, 29, 9, 46, 30); // 10:46 in Berlin

  it("a GMT sheet whose newest row is an hour ahead holds German time", () => {
    const data = { Leads: [head, [serial(Date.UTC(2026, 9, 29, 10, 45, 44)), "Erika", "0151 1"]] };
    expect(sheetDateZone(["Leads"], data, "Etc/GMT", "Europe/Berlin", now)).toBe("Europe/Berlin");
  });

  it("a GMT sheet with real GMT times stays GMT", () => {
    const data = { Leads: [head, [serial(Date.UTC(2026, 9, 29, 9, 45, 44)), "Erika", "0151 1"]] };
    expect(sheetDateZone(["Leads"], data, "Etc/GMT", "Europe/Berlin", now)).toBe("Etc/GMT");
  });

  it("text times and Berlin sheets are left alone", () => {
    const data = { Leads: [head, ["29.10.2026, 10:45:44", "Erika", "0151 1"]] };
    expect(sheetDateZone(["Leads"], data, "Etc/GMT", "Europe/Berlin", now)).toBe("Etc/GMT");
    expect(sheetDateZone(["Leads"], {}, "Europe/Berlin", "Europe/Berlin", now)).toBe("Europe/Berlin");
  });

  it("a row far in the future that no zone explains doesn't flip the sheet", () => {
    const data = { Leads: [head, [serial(Date.UTC(2026, 10, 29, 9, 0, 0)), "Typo", "0151 1"]] };
    expect(sheetDateZone(["Leads"], data, "Etc/GMT", "Europe/Berlin", now)).toBe("Etc/GMT");
  });
});

