import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));
vi.mock("@/lib/background", () => ({ inBackground: vi.fn() }));
vi.mock("@/lib/notify", () => ({
  notifyStaff: vi.fn(),
  notifyUser: vi.fn(),
  notifyClientUsers: vi.fn(),
}));
vi.mock("@/lib/ai/translate", () => ({ translateMessage: vi.fn() }));
vi.mock("@/lib/client-paths", () => ({ staffClientPath: vi.fn(async () => "/internal/clients/x") }));

import { POST, PATCH, DELETE } from "./route";
import {
  STAFF_USER,
  CLIENT_USER,
  OTHER_CLIENT_USER,
  jsonReq,
} from "@/test-utils";

function sbChain(insertData: unknown = { id: "msg-1" }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = vi.fn().mockResolvedValue({ data: insertData, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAdminClient.mockReturnValue(null);
});

describe("POST /api/messages", () => {
  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await POST(jsonReq("http://localhost/api/messages", { content: "hi" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty content", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const res = await POST(jsonReq("http://localhost/api/messages", { content: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/empty/i);
  });

  it("returns 413 for content over 5000 chars", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const res = await POST(jsonReq("http://localhost/api/messages", { content: "a".repeat(5001) }));
    expect(res.status).toBe(413);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const req = new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("ignores a client's attempt to specify another tenant (server overrides)", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await POST(
      jsonReq("http://localhost/api/messages", {
        content: "should go to own tenant",
        clientId: "tenant-b",
      }),
    );
    expect(res.status).toBe(200);
    const insertCall = chain.insert.mock.calls[0]?.[0];
    expect(insertCall.client_id).toBe("tenant-a");
  });

  it("allows staff to send a message to a specific client", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await POST(
      jsonReq("http://localhost/api/messages", {
        content: "Hello",
        clientId: "tenant-a",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("allows staff internal messages (no clientId)", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const chain = sbChain();
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await POST(
      jsonReq("http://localhost/api/messages", {
        content: "Internal note",
        internal: true,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("requires client users to have a clientId", async () => {
    const noTenantClient = { ...CLIENT_USER, client_id: null };
    mockGetAuthUser.mockResolvedValue(noTenantClient);
    const res = await POST(
      jsonReq("http://localhost/api/messages", { content: "hi" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when backend is not configured", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateClient.mockReturnValue(null);
    const res = await POST(
      jsonReq("http://localhost/api/messages", { content: "hi", clientId: "x" }),
    );
    expect(res.status).toBe(503);
  });
});

describe("PATCH /api/messages", () => {
  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await PATCH(jsonReq("http://localhost/api/messages", { id: "x", content: "y" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing id", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const res = await PATCH(jsonReq("http://localhost/api/messages", { content: "y" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when editing another user's message", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const chain = sbChain();
    chain.single.mockResolvedValueOnce({
      data: { client_id: "tenant-a", sender_id: "someone-else" },
      error: null,
    });
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await PATCH(
      jsonReq("http://localhost/api/messages", { id: "msg-1", content: "hacked" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/messages", () => {
  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost/api/messages?id=x", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing id", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const res = await DELETE(new Request("http://localhost/api/messages", { method: "DELETE" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when deleting another user's message", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const chain = sbChain();
    chain.maybeSingle.mockResolvedValueOnce({
      data: { sender_id: "someone-else", client_id: "x", attachment_path: null },
      error: null,
    });
    mockCreateClient.mockReturnValue({ from: () => chain });
    mockCreateAdminClient.mockReturnValue({ from: () => chain, storage: { from: () => ({ remove: vi.fn() }) } });
    const res = await DELETE(
      new Request("http://localhost/api/messages?id=msg-1", { method: "DELETE" }),
    );
    expect(res.status).toBe(403);
  });
});
