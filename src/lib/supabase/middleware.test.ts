import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

vi.mock("./config", () => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", isSupabaseConfigured: true }));

// Fake Supabase: each test decides what getUser returns and whether the call
// "refreshed" the session (i.e. wrote new auth cookies through setAll).
let scenario: { user: object | null; error: unknown; refresh?: boolean; aal?: { currentLevel: string; nextLevel: string } };
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => ({
    auth: {
      getUser: async () => {
        if (scenario.refresh) {
          opts.cookies.setAll([
            { name: "sb-x-auth-token", value: "NEW-ROTATED-TOKEN", options: { path: "/", sameSite: "lax", maxAge: 34560000 } },
          ]);
        }
        return { data: { user: scenario.user }, error: scenario.error };
      },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: scenario.aal ?? { currentLevel: "aal1", nextLevel: "aal1" } }) },
    },
  }),
}));

import { updateSession } from "./middleware";

const req = (path: string, cookies: Record<string, string> = { "sb-x-auth-token": "OLD-TOKEN" }) =>
  new NextRequest(new URL(path, "https://hub.test"), {
    headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
  });

const setCookie = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

describe("session middleware — users stay signed in", () => {
  beforeEach(() => {
    scenario = { user: { id: "u1" }, error: null };
  });

  it("lets a signed-in user through and passes the refreshed token on", async () => {
    scenario.refresh = true;
    const res = await updateSession(req("/dashboard"));
    expect(res.status).toBe(200);
    const c = setCookie(res, "sb-x-auth-token")!;
    expect(c).toContain("NEW-ROTATED-TOKEN");
    expect(c).toMatch(/Max-Age=34560000/); // 400 days: survives closing the browser
  });

  it("keeps the rotated token on redirects (MFA step), so the next request is not signed out", async () => {
    scenario = { user: { id: "u1" }, error: null, refresh: true, aal: { currentLevel: "aal1", nextLevel: "aal2" } };
    const res = await updateSession(req("/internal"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/mfa-verify");
    expect(setCookie(res, "sb-x-auth-token")).toContain("NEW-ROTATED-TOKEN");
  });

  it("does not sign anyone out when Supabase is unreachable", async () => {
    scenario = { user: null, error: new AuthRetryableFetchError("Failed to fetch", 0) };
    const res = await updateSession(req("/dashboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not sign anyone out on a Supabase 503", async () => {
    scenario = { user: null, error: new AuthApiError("Service Unavailable", 503, undefined) };
    expect((await updateSession(req("/internal/clients"))).status).toBe(200);
  });

  it("sends a revoked session to the login page", async () => {
    scenario = { user: null, error: new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used") };
    const res = await updateSession(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?redirect=%2Fdashboard");
  });

  it("sends visitors without any session cookie to login even during an outage", async () => {
    scenario = { user: null, error: new AuthRetryableFetchError("Failed to fetch", 0) };
    const res = await updateSession(req("/dashboard", {}));
    expect(res.status).toBe(307);
  });

  it("'stay signed in' unchecked: refreshed cookies become browser-session cookies", async () => {
    scenario.refresh = true;
    const res = await updateSession(req("/dashboard", { "sb-x-auth-token": "OLD", tylohq_remember: "0" }));
    const c = setCookie(res, "sb-x-auth-token")!;
    expect(c).toContain("NEW-ROTATED-TOKEN");
    expect(c).not.toMatch(/Max-Age|Expires/i);
  });

  it("leaves public pages alone", async () => {
    scenario = { user: null, error: null };
    expect((await updateSession(req("/login", {}))).status).toBe(200);
  });
});
