import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthUser: () => getUser() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const forget = vi.fn();
vi.mock("@/lib/lead-alerts", () => ({ forgetLeadEmailPref: (id: string) => forget(id) }));

let stored: Record<string, Record<string, unknown>> = {};
const updates: { id: string; meta: Record<string, unknown> }[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, user_metadata: stored[id] ?? {} } } }),
        updateUserById: async (id: string, b: { user_metadata: Record<string, unknown> }) => {
          stored[id] = b.user_metadata;
          updates.push({ id, meta: b.user_metadata });
          return { error: null };
        },
      },
    },
  }),
}));

import { PATCH } from "./route";

const call = (body: unknown) => PATCH(new Request("http://x/api/profile", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  stored = { "u-1": { name: "Ali", notify_email: false } };
  updates.length = 0;
  forget.mockClear();
  getUser.mockResolvedValue({ id: "u-1", role: "team" });
});

describe("PATCH /api/profile: lead email switch", () => {
  it("stores lead_email next to the other settings and drops the cached preference", async () => {
    const r = await call({ leadEmail: true });
    expect(r.status).toBe(200);
    expect(stored["u-1"]).toEqual({ name: "Ali", notify_email: false, lead_email: true });
    expect(forget).toHaveBeenCalledWith("u-1");
  });

  it("only booleans; never someone else's account; signed out is refused", async () => {
    for (const v of ["yes", 1, null, { $ne: 1 }]) expect((await call({ leadEmail: v })).status).toBe(400);
    expect(updates).toHaveLength(0);
    await call({ leadEmail: false, id: "u-2", userId: "u-2" });
    expect(updates.map((u) => u.id)).toEqual(["u-1"]);
    getUser.mockResolvedValue(null);
    expect((await call({ leadEmail: true })).status).toBe(401);
  });

  it("other settings don't touch the lead cache", async () => {
    await call({ notifyEmail: true });
    expect(forget).not.toHaveBeenCalled();
  });
});
