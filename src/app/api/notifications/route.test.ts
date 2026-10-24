import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuthUser = vi.fn();
const mockCreateClient = vi.fn();

vi.mock("@/lib/auth", () => ({ getAuthUser: () => mockGetAuthUser() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => mockCreateClient() }));
vi.mock("@/lib/data", () => ({ listNotifications: vi.fn(async () => []) }));
vi.mock("@/lib/notify", () => ({ resetEmailCooldown: vi.fn() }));

import { GET, PATCH } from "./route";
import { STAFF_USER, CLIENT_USER, jsonReq } from "@/test-utils";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/notifications", () => {
  it("returns 401 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns notifications for authenticated user", async () => {
    mockGetAuthUser.mockResolvedValue(CLIENT_USER);
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((fn) => fn({ count: 0 }));
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/notifications", () => {
  it("returns 401 for unauthenticated users", async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await PATCH(jsonReq("http://localhost/api/notifications", { id: "x" }));
    expect(res.status).toBe(401);
  });

  it("scopes mark-read to the authenticated user", async () => {
    mockGetAuthUser.mockResolvedValue(STAFF_USER);
    const chain: Record<string, any> = {};
    chain.update = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.like = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((fn) => fn({ error: null }));
    mockCreateClient.mockReturnValue({ from: () => chain });
    const res = await PATCH(
      jsonReq("http://localhost/api/notifications", { hrefPrefix: "/chat" }),
    );
    expect(res.status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith("user_id", STAFF_USER.id);
  });
});
