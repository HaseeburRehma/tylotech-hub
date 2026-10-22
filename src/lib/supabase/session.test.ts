import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthInvalidTokenResponseError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { isTransientAuthError } from "./session-errors";
import { rememberFromValue, withRemember } from "./remember";

describe("isTransientAuthError — outages never sign people out", () => {
  it.each([
    ["network failure", new AuthRetryableFetchError("Failed to fetch", 0)],
    ["Supabase 503", new AuthApiError("Service Unavailable", 503, undefined)],
    ["gateway sent non-JSON", new AuthUnknownError("Unexpected token <", new Error("x"))],
  ])("%s counts as temporary", (_, err) => {
    expect(isTransientAuthError(err)).toBe(true);
  });

  it.each([
    ["no session cookie", new AuthSessionMissingError()],
    ["refresh returned no session (status 500)", new AuthInvalidTokenResponseError()],
    ["revoked / rotated refresh token", new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used")],
    ["expired JWT rejected", new AuthApiError("invalid JWT", 401, "bad_jwt")],
  ])("%s means signed out", (_, err) => {
    expect(isTransientAuthError(err)).toBe(false);
  });

  it("no error is not transient", () => {
    expect(isTransientAuthError(null)).toBe(false);
  });
});

describe("stay signed in (remember cookie)", () => {
  const supabaseDefaults = { path: "/", sameSite: "lax" as const, httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

  it("defaults to remembering when no choice was stored", () => {
    expect(rememberFromValue(undefined)).toBe(true);
    expect(rememberFromValue("1")).toBe(true);
    expect(rememberFromValue("0")).toBe(false);
  });

  it("keeps the 400-day persistent cookie when checked", () => {
    expect(withRemember(supabaseDefaults, true)).toEqual(supabaseDefaults);
  });

  it("turns auth cookies into browser-session cookies when unchecked", () => {
    const o = withRemember({ ...supabaseDefaults, expires: new Date() }, false);
    expect(o.maxAge).toBeUndefined();
    expect(o.expires).toBeUndefined();
    expect(o.path).toBe("/");
  });

  it("still deletes cookies on sign-out when unchecked", () => {
    expect(withRemember({ ...supabaseDefaults, maxAge: 0 }, false).maxAge).toBe(0);
  });

  it("does not mutate the options it is given", () => {
    const opts = { ...supabaseDefaults };
    withRemember(opts, false);
    expect(opts.maxAge).toBe(supabaseDefaults.maxAge);
  });
});
