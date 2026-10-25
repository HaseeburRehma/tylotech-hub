import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthUser: () => mockGetAuthUser(),
  isStaff: (u: { role: string } | null) => u?.role === "admin" || u?.role === "team",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));
vi.mock("@/lib/notify", () => ({ notifyClientUsers: vi.fn() }));

import { POST } from "./route";
import { CLIENT_USER, STAFF_USER, jsonReq } from "@/test-utils";

const C1 = "11111111-1111-4111-8111-111111111111";
const kpis = [{ label: "Leads", value: "12", unit: "number", delta: "" }];

function userClient() {
  const chain: Record<string, any> = {};
  for (const m of ["select", "eq", "delete", "in"]) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "old-1" }], error: null }).then(r);
  chain.insert = vi.fn().mockResolvedValue({ error: null });
  return { from: vi.fn(() => chain), chain };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(STAFF_USER);
});

describe("POST /api/kpis", () => {
  it("is staff-only", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    expect((await POST(jsonReq("http://localhost/api/kpis", { clientId: C1, kpis }))).status).toBe(403);
  });

  it("rejects a non-uuid client id", async () => {
    mockCreateClient.mockReturnValue(userClient());
    expect((await POST(jsonReq("http://localhost/api/kpis", { clientId: "x' or 1=1", kpis }))).status).toBe(400);
  });

  it("replaces manual KPIs in one atomic RPC", async () => {
    const sb = userClient();
    mockCreateClient.mockReturnValue(sb);
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    mockCreateAdminClient.mockReturnValue({ rpc });
    const res = await POST(jsonReq("http://localhost/api/kpis", { clientId: C1, kpis }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("kpis_replace_manual", expect.objectContaining({ p_client: C1 }));
    expect(rpc.mock.calls[0][1].p_rows[0]).toMatchObject({ label: "Leads", value: 12, delta: null, source: "Manual" });
    expect(sb.chain.insert).not.toHaveBeenCalled();
    expect(sb.chain.delete).not.toHaveBeenCalled();
  });

  it("falls back to insert-then-delete when migration 0045 isn't applied", async () => {
    const sb = userClient();
    mockCreateClient.mockReturnValue(sb);
    mockCreateAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "not found" } }) });
    const res = await POST(jsonReq("http://localhost/api/kpis", { clientId: C1, kpis }));
    expect(res.status).toBe(200);
    expect(sb.chain.insert).toHaveBeenCalledOnce();
    expect(sb.chain.delete).toHaveBeenCalledOnce();
    expect(sb.chain.insert.mock.invocationCallOrder[0]).toBeLessThan(sb.chain.delete.mock.invocationCallOrder[0]);
  });

  it("surfaces a real RPC failure instead of falling back", async () => {
    const sb = userClient();
    mockCreateClient.mockReturnValue(sb);
    mockCreateAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22P02", message: "bad" } }) });
    const res = await POST(jsonReq("http://localhost/api/kpis", { clientId: C1, kpis }));
    expect(res.status).toBe(400);
    expect(sb.chain.insert).not.toHaveBeenCalled();
  });

  it("rejects non-numeric values", async () => {
    mockCreateClient.mockReturnValue(userClient());
    const res = await POST(jsonReq("http://localhost/api/kpis", { clientId: C1, kpis: [{ label: "X", value: "abc" }] }));
    expect(res.status).toBe(400);
  });
});
