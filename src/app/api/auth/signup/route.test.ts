import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));

import { jsonReq } from "@/test-utils";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

async function importRoute() {
  vi.resetModules();
  return import("./route");
}

describe("POST /api/auth/signup", () => {
  it("returns 503 when TEAM_SIGNUP_CODE is not set", async () => {
    vi.stubEnv("TEAM_SIGNUP_CODE", "");
    const { POST } = await importRoute();
    const res = await POST(jsonReq("http://localhost/api/auth/signup", { name: "A", email: "a@b.com", password: "123456789012", code: "x" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for missing fields", async () => {
    vi.stubEnv("TEAM_SIGNUP_CODE", "secret-code-123");
    const { POST } = await importRoute();
    const res = await POST(jsonReq("http://localhost/api/auth/signup", { name: "A" }));
    expect(res.status).toBe(400);
  });

  it("rejects passwords shorter than 12 characters", async () => {
    vi.stubEnv("TEAM_SIGNUP_CODE", "secret-code-123");
    const { POST } = await importRoute();
    const res = await POST(jsonReq("http://localhost/api/auth/signup", {
      name: "Test",
      email: "test@example.com",
      password: "short",
      code: "secret-code-123",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/12/);
  });

  it("rejects passwords longer than 128 characters", async () => {
    vi.stubEnv("TEAM_SIGNUP_CODE", "secret-code-123");
    const { POST } = await importRoute();
    const res = await POST(jsonReq("http://localhost/api/auth/signup", {
      name: "Test",
      email: "test@example.com",
      password: "a".repeat(129),
      code: "secret-code-123",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for wrong invite code (timing-safe)", async () => {
    vi.stubEnv("TEAM_SIGNUP_CODE", "secret-code-123");
    const { POST } = await importRoute();
    const res = await POST(jsonReq("http://localhost/api/auth/signup", {
      name: "Hacker",
      email: "h@evil.com",
      password: "123456789012",
      code: "wrong-code",
    }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for malformed JSON", async () => {
    vi.stubEnv("TEAM_SIGNUP_CODE", "secret-code-123");
    const { POST } = await importRoute();
    const res = await POST(new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{{broken",
    }));
    expect(res.status).toBe(400);
  });
});
