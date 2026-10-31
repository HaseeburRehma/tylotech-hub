import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test-fake-db";

const mockUser = vi.fn();
let db = fakeDb();
vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockUser(), isStaff: (u: any) => !!u && u.role !== "client" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
vi.mock("@/lib/logo-tone-server", () => ({ logoTone: async (u: string | null) => (u?.includes("white") ? "light" : "dark") }));

import { GET } from "./route";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const get = (qs = "") => GET(new Request(`http://x/api/branding${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb({ clients: [{ id: C2, company: "Nordic Estate", logo_url: "https://x/white.png" }] });
});

describe("GET /api/branding", () => {
  it("requires sign-in", async () => {
    mockUser.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("gives a client their own branding, whatever ?clientId says", async () => {
    mockUser.mockResolvedValue({ id: "c1", role: "client", client_id: C1, company: "Musterbad", logoUrl: "https://x/dark.png" });
    expect(await (await get(`?clientId=${C2}`)).json()).toEqual({ company: "Musterbad", logoUrl: "https://x/dark.png", logoTone: "dark" });
  });

  it("gives the team the asked partner's branding", async () => {
    mockUser.mockResolvedValue({ id: "s1", role: "admin", client_id: null, company: null, logoUrl: null });
    expect(await (await get(`?clientId=${C2}`)).json()).toEqual({ company: "Nordic Estate", logoUrl: "https://x/white.png", logoTone: "light" });
  });

  it("refuses odd or unknown partner ids from the team", async () => {
    mockUser.mockResolvedValue({ id: "s1", role: "team", client_id: null });
    expect((await get("?clientId=../users")).status).toBe(400);
    expect((await get(`?clientId=${C1}`)).status).toBe(404);
  });

  it("the team without ?clientId gets the old answer (no partner)", async () => {
    mockUser.mockResolvedValue({ id: "s1", role: "team", client_id: null, company: null, logoUrl: null });
    expect(await (await get()).json()).toEqual({ company: null, logoUrl: null, logoTone: "dark" });
  });
});
