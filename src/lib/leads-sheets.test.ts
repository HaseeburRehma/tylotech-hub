import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const alerts: { id: string; name: string | null }[] = [];
vi.mock("@/lib/lead-alerts", () => ({ alertNewLead: vi.fn(async (_a: unknown, lead: { id: string; name: string | null }) => void alerts.push(lead)) }));
vi.mock("@/lib/background", () => ({ inBackground: (_l: string, task: () => Promise<unknown>) => task() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), isStaff: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
const refresh = vi.fn(async (t: string) => (t === "rt-ok" ? "at-ok" : null));
vi.mock("@/lib/integrations/oauth", () => ({ refreshGoogleAccessToken: (t: string) => refresh(t) }));

import { syncSheetLeads, syncSheetSource, type SheetConfig } from "./leads-sheets";

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
