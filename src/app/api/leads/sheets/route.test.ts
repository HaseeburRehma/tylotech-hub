import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthUser = vi.fn();
const mockAdmin = vi.fn();
const mockSync = vi.fn(async () => ({ added: 3, updated: 1, alerted: 1, pending: 0 }));
const mockMeta = vi.fn(async () => ({ title: "Ads Leads", timeZone: "Europe/Berlin", tabs: [{ title: "Leads", index: 0, hidden: false }, { title: "Retreat", index: 1, hidden: false }] }));

vi.mock("@/lib/auth", () => ({
  getAuthUser: () => mockGetAuthUser(),
  isStaff: (u: { role: string } | null) => u?.role === "admin" || u?.role === "team",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockAdmin() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: async () => ({ success: true }) }) }));
vi.mock("@/lib/leads-sheets", () => ({
  SHEETS_SCOPE: "https://www.googleapis.com/auth/spreadsheets.readonly",
  SheetError: class extends Error {},
  sheetToken: async (t: string | null) => (t ? "at" : null),
  sheetMeta: () => mockMeta(),
  readTabs: async () => ({}),
  sheetErrorText: () => "x",
  syncSheetSource: () => mockSync(),
}));
vi.mock("next/headers", () => ({ cookies: () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));

import { CLIENT_USER, OTHER_CLIENT_USER, STAFF_USER } from "@/test-utils";
import { GET as connect } from "./connect/route";
import { PATCH, POST } from "./[id]/route";

const SRC_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE = { id: SRC_ID, client_id: CLIENT_USER.client_id, kind: "google_sheet", label: "Ads Leads", external_id: "sheet-1", access_token: "rt", config: { tabs: ["Leads"] } };

let updates: unknown[] = [];
function adminWith(src: unknown) {
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.update = (p: unknown) => (updates.push(p), chain);
  chain.maybeSingle = async () => ({ data: src, error: null });
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res);
  return { from: () => chain };
}
const patch = async (body: unknown, id = SRC_ID) => (await PATCH(new Request(`http://x/api/leads/sheets/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: { id } }))!;

beforeEach(() => {
  updates = [];
  mockSync.mockClear();
  mockAdmin.mockReturnValue(adminWith(SOURCE));
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
});

describe("PATCH/POST /api/leads/sheets/[id]", () => {
  it("401 without a session", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    expect((await patch({ tabs: ["Leads"] })).status).toBe(401);
  });
  it("another partner's user can't see or change the source (404, nothing written)", async () => {
    mockGetAuthUser.mockResolvedValue(OTHER_CLIENT_USER);
    expect((await patch({ tabs: ["Leads"] })).status).toBe(404);
    expect((await POST(new Request("http://x"), { params: { id: SRC_ID } }))!.status).toBe(404);
    expect(updates).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });
  it("a non-sheet source is not reachable here", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockAdmin.mockReturnValue(adminWith({ ...SOURCE, kind: "webhook" }));
    expect((await patch({ tabs: ["Leads"] })).status).toBe(404);
  });
  it("rejects bad ids, empty, too many and unknown tabs", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    expect((await patch({ tabs: ["Leads"] }, "not-a-uuid")).status).toBe(400);
    expect((await patch({ tabs: [] })).status).toBe(400);
    expect((await patch({ tabs: "Leads" })).status).toBe(400);
    expect((await patch({ tabs: Array.from({ length: 11 }, (_, i) => `t${i}`) })).status).toBe(400);
    expect((await patch({ tabs: ["Leads", "Secret tab"] })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
  it("the partner's own user and the team can pick tabs; import runs", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const r = await patch({ tabs: ["Leads", "Retreat", "Leads"] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ added: 3, updated: 1 });
    expect(updates[0]).toMatchObject({ config: { tabs: ["Leads", "Retreat"] } });
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    expect((await patch({ tabs: ["Retreat"] })).status).toBe(200);
  });
  it("409 when the Google grant is gone", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockAdmin.mockReturnValue(adminWith({ ...SOURCE, access_token: null }));
    expect((await patch({ tabs: ["Leads"] })).status).toBe(409);
  });
});

describe("GET /api/leads/sheets/connect", () => {
  const go = (qs: string) => connect(new Request(`http://x/api/leads/sheets/connect?${qs}`));
  it("sends people without a session to login", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    expect((await go("url=x")).headers.get("location")).toBe("http://x/login");
  });
  it("rejects links that aren't Google Sheets", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const loc = (await go(`clientId=${SRC_ID}&url=${encodeURIComponent("https://evil.example/x")}`)).headers.get("location");
    expect(loc).toBe("http://x/leads?sheet=bad_url");
  });
  it("a client always connects for their own company, whatever clientId they send", async () => {
    mockGetAuthUser.mockResolvedValue({ ...CLIENT_USER, client_id: SRC_ID });
    const url = encodeURIComponent("https://docs.google.com/spreadsheets/d/1np-l81lBeZ8850Gxw7Ps0hrOUZ56823uJsDU3SRe8KU/edit");
    const loc = new URL((await go(`clientId=22222222-2222-4222-8222-222222222222&url=${url}`)).headers.get("location")!);
    expect(loc.host).toBe("accounts.google.com");
    expect(loc.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/spreadsheets.readonly");
    expect(loc.searchParams.get("access_type")).toBe("offline");
    const state = JSON.parse(Buffer.from(loc.searchParams.get("state")!, "base64url").toString());
    expect(state).toMatchObject({ provider: "google_sheet", clientId: SRC_ID, sheet: "1np-l81lBeZ8850Gxw7Ps0hrOUZ56823uJsDU3SRe8KU" });
    expect(state.nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});
