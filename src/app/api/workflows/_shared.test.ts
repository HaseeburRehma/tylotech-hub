import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockIsStaff = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthUser: () => mockGetAuthUser(),
  isStaff: (u: unknown) => mockIsStaff(u),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));

import { staffContext, engineError } from "./_shared";

beforeEach(() => vi.clearAllMocks());

describe("staffContext", () => {
  it("returns 403 for non-staff users", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "c1", role: "client" });
    mockIsStaff.mockReturnValue(false);
    const result = await staffContext();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(403);
    }
  });

  it("returns 403 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    mockIsStaff.mockReturnValue(false);
    const result = await staffContext();
    expect("error" in result).toBe(true);
  });

  it("returns 503 when admin client is not configured", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "s1", role: "admin" });
    mockIsStaff.mockReturnValue(true);
    mockCreateAdminClient.mockReturnValue(null);
    const result = await staffContext();
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.status).toBe(503);
    }
  });

  it("returns user and admin for staff", async () => {
    const user = { id: "s1", role: "admin" };
    mockGetAuthUser.mockResolvedValue(user);
    mockIsStaff.mockReturnValue(true);
    const admin = { from: vi.fn() };
    mockCreateAdminClient.mockReturnValue(admin);
    const result = await staffContext();
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user).toBe(user);
      expect(result.admin).toBe(admin);
    }
  });
});

describe("engineError", () => {
  it("maps 'not active' to 409", () => {
    const res = engineError("step is not active");
    expect(res.status).toBe(409);
  });

  it("maps 'not finished' to 409", () => {
    const res = engineError("step not finished yet");
    expect(res.status).toBe(409);
  });

  it("maps 'not found' to 404", () => {
    const res = engineError("run not found");
    expect(res.status).toBe(404);
  });

  it("falls back to 400 with generic message for other errors", async () => {
    const res = engineError("something else");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain("something else");
  });
});
