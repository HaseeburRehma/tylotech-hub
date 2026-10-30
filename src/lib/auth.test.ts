import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: true }));

const jwt = (payload: object) =>
  `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

// Fake Supabase: the session token (cookie or bearer), what the Auth server says
// about it, and the profile row RLS hands back.
let s: {
  bearer: string | null;
  sessionToken: string | null;
  sessionUserFactors?: { status: string }[];
  user: { id: string; factors?: { status: string }[]; user_metadata?: object } | null;
  userError: unknown;
  profile: Record<string, unknown> | null;
  profileError: { code: string } | null;
};
const calls: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  bearerToken: () => s.bearer,
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: s.sessionToken ? { access_token: s.sessionToken, user: { factors: s.sessionUserFactors ?? [] } } : null },
        error: null,
      }),
      getUser: async (token?: string) => {
        calls.push(`getUser:${token ? "token" : "session"}`);
        return { data: { user: s.user }, error: s.userError };
      },
    },
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          single: async () => {
            calls.push(`profile:${id}`);
            return { data: s.profile, error: s.profileError };
          },
        }),
      }),
    }),
  }),
}));

import { getAuthUser } from "./auth";

const UID = "11111111-1111-1111-1111-111111111111";
const profile = (extra: Record<string, unknown> = {}) => ({
  id: UID,
  email: "a@b.de",
  name: "A",
  role: "client",
  client_id: "tenant-a",
  clients: { company: "A GmbH", archived_at: null },
  ...extra,
});

describe("getAuthUser", () => {
  beforeEach(() => {
    calls.length = 0;
    s = {
      bearer: null,
      sessionToken: jwt({ sub: UID, aal: "aal1" }),
      user: { id: UID, factors: [] },
      userError: null,
      profile: profile(),
      profileError: null,
    };
  });

  it("signs in a cookie session with one server check and one profile read", async () => {
    const u = await getAuthUser();
    expect(u?.id).toBe(UID);
    expect(u?.company).toBe("A GmbH");
    expect(calls.sort()).toEqual([`getUser:token`, `profile:${UID}`]);
  });

  it("accepts the mobile app's bearer token", async () => {
    s.sessionToken = null;
    s.bearer = jwt({ sub: UID, aal: "aal1" });
    expect((await getAuthUser())?.id).toBe(UID);
  });

  it("refuses when there is no session at all", async () => {
    s.sessionToken = null;
    expect(await getAuthUser()).toBeNull();
    expect(calls).toEqual([]);
  });

  it("refuses a token the Auth server rejects (forged or revoked), even if a profile row came back", async () => {
    s.user = null;
    s.userError = new AuthApiError("invalid JWT", 403, "bad_jwt");
    expect(await getAuthUser()).toBeNull();
  });

  it("refuses when the token's subject is not the verified user", async () => {
    s.sessionToken = jwt({ sub: "22222222-2222-2222-2222-222222222222", aal: "aal1" });
    s.profile = profile({ id: "22222222-2222-2222-2222-222222222222" });
    expect(await getAuthUser()).toBeNull();
  });

  it("refuses a password-only session when 2FA is enrolled, even if the cookie claims no factors", async () => {
    s.user = { id: UID, factors: [{ status: "verified" }] };
    s.sessionUserFactors = []; // edited cookie
    expect(await getAuthUser()).toBeNull();
  });

  it("accepts a completed 2FA session", async () => {
    s.user = { id: UID, factors: [{ status: "verified" }] };
    s.sessionToken = jwt({ sub: UID, aal: "aal2" });
    expect((await getAuthUser())?.id).toBe(UID);
  });

  it("enforces 2FA for bearer tokens too", async () => {
    s.sessionToken = null;
    s.bearer = jwt({ sub: UID, aal: "aal1" });
    s.user = { id: UID, factors: [{ status: "verified" }] };
    expect(await getAuthUser()).toBeNull();
  });

  it("refuses deactivated users", async () => {
    s.profile = profile({ deactivated_at: "2026-01-01T00:00:00Z" });
    expect(await getAuthUser()).toBeNull();
  });

  it("refuses partners of an archived client", async () => {
    s.profile = profile({ clients: { company: "A GmbH", archived_at: "2026-01-01T00:00:00Z" } });
    expect(await getAuthUser()).toBeNull();
  });

  it("refuses a signed-in user without a profile row", async () => {
    s.profile = null;
    s.profileError = { code: "PGRST116" };
    expect(await getAuthUser()).toBeNull();
  });

  it("an Auth outage is an error, not a sign-out", async () => {
    s.user = null;
    s.userError = new AuthRetryableFetchError("Failed to fetch", 0);
    await expect(getAuthUser()).rejects.toThrow(/temporarily unavailable/);
  });

  it("a profile read outage is an error, not a sign-out", async () => {
    s.profile = null;
    s.profileError = { code: "57014" };
    await expect(getAuthUser()).rejects.toThrow(/temporarily unavailable/);
  });

  it("a malformed token is refused without asking the server", async () => {
    s.sessionToken = "not-a-jwt";
    expect(await getAuthUser()).toBeNull();
    expect(calls).toEqual([]);
  });
});
