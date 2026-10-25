import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockIsStaff = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthUser: () => mockGetAuthUser(),
  isStaff: (u: unknown) => mockIsStaff(u),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST, PATCH, DELETE } from "./route";
import { STAFF_USER, CLIENT_USER, ADMIN_USER, jsonReq } from "@/test-utils";

const C1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const ANNA = "33333333-3333-4333-8333-333333333333";
const BEN = "44444444-4444-4444-8444-444444444444";
const CLIENT_GUY = "55555555-5555-4555-8555-555555555555";
const USERS = [
  { id: ANNA, name: "Anna", role: "team" },
  { id: BEN, name: "Ben", role: "admin" },
  { id: CLIENT_GUY, name: "Client Guy", role: "client" },
];

function sbChain(data: unknown = { id: P1, client_id: C1, name: "Test" }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn((_col: string, ids: string[]) => Promise.resolve({ data: USERS.filter((u) => ids.includes(u.id)), error: null }));
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/projects — access control", () => {
  it("returns 403 for client users", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockIsStaff.mockReturnValue(false);
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "Hack" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    mockIsStaff.mockReturnValue(false);
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "X" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when clientId is missing", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await POST(jsonReq("http://localhost/api/projects", { name: "Project" }));
    expect(res.status).toBe(400);
  });

  it("allows staff to create a project", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "My Project" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("clamps progress to 0–100", async () => {
    mockGetAuthUser.mockResolvedValue(ADMIN_USER);
    mockIsStaff.mockReturnValue(true);
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "P", progress: 999 }));
    const insertArg = chain.insert.mock.calls[0][0];
    expect(insertArg.progress).toBe(100);
  });
});

describe("PATCH /api/projects — validation", () => {
  it("returns 403 for client users", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockIsStaff.mockReturnValue(false);
    const res = await PATCH(jsonReq("http://localhost/api/projects", { id: P1, name: "X" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing id", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(jsonReq("http://localhost/api/projects", { name: "X" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty update", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(jsonReq("http://localhost/api/projects", { id: P1 }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid status", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(
      jsonReq("http://localhost/api/projects", { id: P1, status: "hacked" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid due date format", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(
      jsonReq("http://localhost/api/projects", { id: P1, due: "not-a-date" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects project names over 160 chars", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(
      jsonReq("http://localhost/api/projects", { id: P1, name: "x".repeat(161) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("projects — assignees", () => {
  beforeEach(() => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
  });

  it("stores every assignee, the first as lead, with names looked up server-side", async () => {
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await POST(
      jsonReq("http://localhost/api/projects", { clientId: C1, name: "P", assigneeIds: [BEN, ANNA, BEN], assignedToName: "Spoofed" }),
    );
    expect(res.status).toBe(200);
    const row = chain.insert.mock.calls[0][0];
    expect(row.assignee_ids).toEqual([BEN, ANNA]);
    expect(row.assigned_to_id).toBe(BEN);
    expect(row.assigned_to).toBe("Ben, Anna");
  });

  it("rejects client accounts and unknown ids as assignees", async () => {
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    for (const ids of [[CLIENT_GUY], [ANNA, "66666666-6666-4666-8666-666666666666"]]) {
      const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "P", assigneeIds: ids }));
      expect(res.status).toBe(400);
    }
  });

  it.each([["not-a-uuid"], "string", [1], Array.from({ length: 11 }, () => ANNA)])("rejects malformed assigneeIds %#", async (ids) => {
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "P", assigneeIds: ids }));
    expect(res.status).toBe(400);
  });

  it("PATCH with an empty list unassigns everyone", async () => {
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await PATCH(jsonReq("http://localhost/api/projects", { id: P1, assigneeIds: [] }));
    expect(res.status).toBe(200);
    expect(chain.update.mock.calls[0][0]).toMatchObject({ assignee_ids: [], assigned_to_id: null, assigned_to: null });
  });

  it("falls back to lead-only when assignee_ids doesn't exist yet (pre-0045)", async () => {
    const chain = sbChain();
    chain.single = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST204", message: "Could not find the 'assignee_ids' column of 'projects'" } })
      .mockResolvedValueOnce({ data: { id: P1, client_id: C1, name: "P" }, error: null });
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "P", assigneeIds: [ANNA, BEN] }));
    expect(res.status).toBe(200);
    const retry = chain.insert.mock.calls[1][0];
    expect(retry.assignee_ids).toBeUndefined();
    expect(retry).toMatchObject({ assigned_to_id: ANNA, assigned_to: "Anna, Ben" });
  });
});

describe("projects — input validation", () => {
  beforeEach(() => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
  });

  it("rejects non-uuid client, project and delete ids", async () => {
    expect((await POST(jsonReq("http://localhost/api/projects", { clientId: "c1' or 1=1", name: "P" }))).status).toBe(400);
    expect((await PATCH(jsonReq("http://localhost/api/projects", { id: "x", name: "P" }))).status).toBe(400);
    expect((await DELETE(new Request("http://localhost/api/projects?id=x", { method: "DELETE" }))).status).toBe(400);
  });

  it("POST enforces name length and due-date format like PATCH", async () => {
    expect((await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "x".repeat(161) }))).status).toBe(400);
    expect((await POST(jsonReq("http://localhost/api/projects", { clientId: C1, name: "P", due: "tomorrow" }))).status).toBe(400);
  });
});

describe("DELETE /api/projects", () => {
  it("returns 403 for client users", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockIsStaff.mockReturnValue(false);
    const res = await DELETE(new Request(`http://localhost/api/projects?id=${P1}`, { method: "DELETE" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing id", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await DELETE(new Request("http://localhost/api/projects", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });
});
