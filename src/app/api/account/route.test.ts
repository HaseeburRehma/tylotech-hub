import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockLimit = vi.fn();
const mockLogAudit = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mockCreateAdminClient() }));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => mockLogAudit(...a) }));
vi.mock("@/lib/rate-limit", () => ({
  getRateLimiter: () => ({ limit: mockLimit }),
  rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));

import { DELETE } from "./route";
import { ADMIN_USER, CLIENT_USER, STAFF_USER, jsonReq } from "@/test-utils";

const URL = "http://localhost/api/account";
const del = (body: unknown) => DELETE(jsonReq(URL, body, "DELETE"));

function adminClient({ deleteError = null as { message: string } | null } = {}) {
  const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
  return {
    from: vi.fn(() => chain),
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: deleteError }) } },
    storage: { from: vi.fn(() => ({ remove: vi.fn().mockResolvedValue({ error: null }) })) },
    _chain: chain,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLimit.mockResolvedValue({ success: true, limit: 3, remaining: 2, reset: Date.now() + 1000 });
});

describe("DELETE /api/account", () => {
  it("returns 401 when signed out", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    expect((await del({ confirm: "DELETE" })).status).toBe(401);
  });

  it("returns 401 for the demo identity (backend not configured)", async () => {
    mockGetAuthUser.mockResolvedValue({ ...CLIENT_USER, id: "demo" });
    expect((await del({ confirm: "DELETE" })).status).toBe(401);
  });

  it.each([STAFF_USER, ADMIN_USER])("refuses staff accounts ($role)", async (u) => {
    mockGetAuthUser.mockResolvedValue(u);
    const admin = adminClient();
    mockCreateAdminClient.mockReturnValue(admin);
    expect((await del({ confirm: "DELETE" })).status).toBe(403);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each([{}, { confirm: "delete" }, { confirm: "LÖSCHEN" }, { confirm: true }, null])("requires the exact confirmation (%j)", async (body) => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const admin = adminClient();
    mockCreateAdminClient.mockReturnValue(admin);
    expect((await del(body)).status).toBe(400);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockCreateAdminClient.mockReturnValue(adminClient());
    const res = await DELETE(new Request(URL, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{{" }));
    expect(res.status).toBe(400);
  });

  it("rate-limits per user and does not delete when limited", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const admin = adminClient();
    mockCreateAdminClient.mockReturnValue(admin);
    mockLimit.mockResolvedValue({ success: false, limit: 3, remaining: 0, reset: Date.now() + 60_000 });
    const res = await del({ confirm: "DELETE" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(mockLimit).toHaveBeenCalledWith(`account-delete:${CLIENT_USER.id}`, expect.objectContaining({ limit: 3 }));
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("returns 503 when the admin client is unavailable", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    mockCreateAdminClient.mockReturnValue(null);
    expect((await del({ confirm: "DELETE" })).status).toBe(503);
  });

  it("deletes only the caller's auth user and audit-logs it first", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const admin = adminClient();
    mockCreateAdminClient.mockReturnValue(admin);
    // Any id smuggled into the body is ignored.
    const res = await del({ confirm: "DELETE", id: "client-2", userId: "admin-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(CLIENT_USER.id);
    expect(mockLogAudit).toHaveBeenCalledWith(
      CLIENT_USER,
      expect.objectContaining({ action: "account.delete", targetId: CLIENT_USER.id, clientId: CLIENT_USER.client_id }),
      admin,
    );
    expect(mockLogAudit.mock.invocationCallOrder[0]).toBeLessThan(admin.auth.admin.deleteUser.mock.invocationCallOrder[0]);
    // Unblocks the one foreign key without an ON DELETE rule.
    expect(admin.from).toHaveBeenCalledWith("activity_events");
    expect(admin._chain.update).toHaveBeenCalledWith({ created_by: null });
    expect(admin._chain.eq).toHaveBeenCalledWith("created_by", CLIENT_USER.id);
  });

  it("removes the caller's own avatar file, never someone else's", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const admin = { ...adminClient(), storage: { from: vi.fn(() => ({ remove })) } };
    mockCreateAdminClient.mockReturnValue(admin);

    mockGetAuthUser.mockResolvedValue({ ...CLIENT_USER, avatarUrl: `https://x.supabase.co/storage/v1/object/public/logos/avatars/${CLIENT_USER.id}-1.png` });
    await del({ confirm: "DELETE" });
    expect(remove).toHaveBeenCalledWith([`avatars/${CLIENT_USER.id}-1.png`]);

    remove.mockClear();
    mockGetAuthUser.mockResolvedValue({ ...CLIENT_USER, avatarUrl: "https://x.supabase.co/storage/v1/object/public/logos/avatars/client-2-1.png" });
    await del({ confirm: "DELETE" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns 500 and logs the failure when Supabase refuses the delete", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const admin = adminClient({ deleteError: { message: "violates foreign key constraint" } });
    mockCreateAdminClient.mockReturnValue(admin);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await del({ confirm: "DELETE" });
    expect(res.status).toBe(500);
    // Internal details stay in the log, not the response.
    expect((await res.json()).error).not.toMatch(/foreign key/);
    expect(mockLogAudit).toHaveBeenLastCalledWith(CLIENT_USER, expect.objectContaining({ action: "account.delete_failed" }), admin);
  });
});
