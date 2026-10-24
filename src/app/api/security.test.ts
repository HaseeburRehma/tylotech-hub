import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateClient = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthUser: () => mockGetAuthUser(),
  isStaff: (u: { role: string } | null) => u?.role === "admin" || u?.role === "team",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/background", () => ({ inBackground: vi.fn() }));
vi.mock("@/lib/notify", () => ({
  notifyStaff: vi.fn(),
  notifyUser: vi.fn(),
  notifyClientUsers: vi.fn(),
}));
vi.mock("@/lib/ai/translate", () => ({ translateMessage: vi.fn() }));
vi.mock("@/lib/client-paths", () => ({ staffClientPath: vi.fn(async () => "/x") }));

import { POST as messagesPost } from "./messages/route";
import { POST as projectsPost, PATCH as projectsPatch } from "./projects/route";
import { CLIENT_USER, OTHER_CLIENT_USER, STAFF_USER, jsonReq } from "@/test-utils";

function sbChain(insertData: unknown = { id: "x", client_id: "c1", name: "Test" }) {
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

describe("Cross-tenant isolation", () => {
  it("Client A sending messages cannot see Client B's data", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const chain = sbChain({ id: "msg-1" });
    mockCreateClient.mockReturnValue({ from: () => chain });

    const res = await messagesPost(
      jsonReq("http://localhost/api/messages", { content: "Hi", clientId: "tenant-b" }),
    );
    expect(res.status).toBe(200);
    const insertArg = chain.insert.mock.calls[0]?.[0];
    expect(insertArg.client_id).toBe("tenant-a");
    expect(insertArg.client_id).not.toBe("tenant-b");
  });
});

describe("Concurrent rapid-fire requests (rate limiter)", () => {
  it("rate limiter blocks after exceeding the limit", async () => {
    const { getRateLimiter } = await import("@/lib/rate-limit");
    const rl = getRateLimiter();
    const key = `stress-test-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rl.limit(key, { limit: 5, windowSec: 60 })),
    );
    const allowed = results.filter((r) => r.success).length;
    const blocked = results.filter((r) => !r.success).length;
    expect(allowed).toBe(5);
    expect(blocked).toBe(5);
  });

  it("different users have independent rate limits", async () => {
    const { getRateLimiter } = await import("@/lib/rate-limit");
    const rl = getRateLimiter();
    const ts = Date.now();
    const [a1, a2, a3, b1, b2, b3] = await Promise.all([
      rl.limit(`user-a-${ts}`, { limit: 2, windowSec: 60 }),
      rl.limit(`user-a-${ts}`, { limit: 2, windowSec: 60 }),
      rl.limit(`user-a-${ts}`, { limit: 2, windowSec: 60 }),
      rl.limit(`user-b-${ts}`, { limit: 2, windowSec: 60 }),
      rl.limit(`user-b-${ts}`, { limit: 2, windowSec: 60 }),
      rl.limit(`user-b-${ts}`, { limit: 2, windowSec: 60 }),
    ]);
    expect(a1.success).toBe(true);
    expect(a2.success).toBe(true);
    expect(a3.success).toBe(false);
    expect(b1.success).toBe(true);
    expect(b2.success).toBe(true);
    expect(b3.success).toBe(false);
  });

  it("simulates 50 concurrent users hitting message API", async () => {
    const { getRateLimiter } = await import("@/lib/rate-limit");
    const rl = getRateLimiter();
    const ts = Date.now();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        rl.limit(`user-${i}-${ts}`, { limit: 120, windowSec: 60 }),
      ),
    );
    expect(results.every((r) => r.success)).toBe(true);
  });
});

describe("Input fuzzing — SQL/XSS injection attempts", () => {
  const payloads = [
    "'; DROP TABLE messages; --",
    "<script>alert('xss')</script>",
    "${7*7}",
    "{{constructor.constructor('return this')()}}",
    "Robert'); DROP TABLE Students;--",
    "\x00\x01\x02\x03",
    "a".repeat(10000),
    "🔥".repeat(1000),
  ];

  it.each(payloads)("messages API handles payload: %j", async (payload) => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const chain = sbChain({ id: "m1" });
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await messagesPost(
      jsonReq("http://localhost/api/messages", { content: payload, clientId: "c1" }),
    );
    // Payloads over 5000 chars should be rejected; others should succeed but
    // NEVER execute — they go through parameterised queries.
    if (payload.length > 5000) {
      expect(res.status).toBe(413);
    } else {
      expect(res.status).toBe(200);
      const insertArg = chain.insert.mock.calls[0]?.[0];
      expect(insertArg.content).toBe(payload.trim());
    }
  });

  it("projects API rejects XSS in status field", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await projectsPatch(
      jsonReq("http://localhost/api/projects", {
        id: "p1",
        status: "<script>alert(1)</script>",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("Privilege escalation attempts", () => {
  it("client user cannot create projects (staff-only)", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await projectsPost(
      jsonReq("http://localhost/api/projects", { clientId: "tenant-a", name: "Hack" }),
    );
    expect(res.status).toBe(403);
  });

  it("client user cannot patch projects", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockCreateClient.mockReturnValue({ from: () => sbChain() });
    const res = await projectsPatch(
      jsonReq("http://localhost/api/projects", { id: "p1", name: "Hacked" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("Malformed request handling", () => {
  it("handles non-JSON POST to messages gracefully", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const res = await messagesPost(
      new Request("http://localhost/api/messages", {
        method: "POST",
        body: "not json at all",
        headers: { "Content-Type": "text/plain" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("handles empty body POST to messages", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const res = await messagesPost(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      }),
    );
    expect(res.status).toBe(400);
  });
});
