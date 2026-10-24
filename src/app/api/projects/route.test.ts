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

function sbChain(data: unknown = { id: "proj-1", client_id: "c1", name: "Test" }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
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
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: "c1", name: "Hack" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    mockIsStaff.mockReturnValue(false);
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: "c1", name: "X" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: "c1" }));
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
    const res = await POST(jsonReq("http://localhost/api/projects", { clientId: "c1", name: "My Project" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("clamps progress to 0–100", async () => {
    mockGetAuthUser.mockResolvedValue(ADMIN_USER);
    mockIsStaff.mockReturnValue(true);
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    await POST(jsonReq("http://localhost/api/projects", { clientId: "c1", name: "P", progress: 999 }));
    const insertArg = chain.insert.mock.calls[0][0];
    expect(insertArg.progress).toBe(100);
  });
});

describe("PATCH /api/projects — validation", () => {
  it("returns 403 for client users", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockIsStaff.mockReturnValue(false);
    const res = await PATCH(jsonReq("http://localhost/api/projects", { id: "proj-1", name: "X" }));
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
    const res = await PATCH(jsonReq("http://localhost/api/projects", { id: "proj-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid status", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(
      jsonReq("http://localhost/api/projects", { id: "proj-1", status: "hacked" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid due date format", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(
      jsonReq("http://localhost/api/projects", { id: "proj-1", due: "not-a-date" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects project names over 160 chars", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockIsStaff.mockReturnValue(true);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await PATCH(
      jsonReq("http://localhost/api/projects", { id: "proj-1", name: "x".repeat(161) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects", () => {
  it("returns 403 for client users", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockIsStaff.mockReturnValue(false);
    const res = await DELETE(new Request("http://localhost/api/projects?id=p1", { method: "DELETE" }));
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
