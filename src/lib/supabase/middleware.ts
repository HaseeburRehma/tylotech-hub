import { LOGIN_BRAND_COOKIE, loginPathFor } from "@/lib/login-brand";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import { REMEMBER_COOKIE, rememberFromValue, withRemember } from "./remember";
import { isTransientAuthError } from "./session-errors";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PORTAL_PREFIXES = [
  "/dashboard",
  "/performance",
  "/integrations",
  "/ai-tools",
  "/chat",
  "/documents",
  "/approvals",
  "/leads",
  "/projects",
  "/creatives",
  "/internal",
  "/settings",
];

/** Refreshes the auth session cookie and guards portal routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // No backend yet → app runs on mock data, nothing to guard.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        const remember = rememberFromValue(request.cookies.get(REMEMBER_COOKIE)?.value);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, withRemember(options, remember)),
        );
      },
    },
  });

  // getClaims refreshes an expiring session like getUser did, but verifies the
  // token locally against the project's published signing key (cached per
  // instance) instead of asking the Auth server on every request. This only
  // routes; getAuthUser stays the authority and still checks with the server
  // (revoked sessions, 2FA, deactivated users).
  const { data: claimsData, error: authError } = await supabase.auth.getClaims().catch((e: unknown) => ({
    data: null,
    // Anything unexpected (e.g. a key that can't be imported) counts as an outage, not a sign-out.
    error: { name: "ClaimsError", status: 0, message: String(e) },
  }));
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;

  const path = request.nextUrl.pathname;
  const isPortal = PORTAL_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

  // A redirect must carry the cookies the refresh above just wrote — otherwise
  // the browser keeps the old (already rotated) refresh token and is signed out
  // on its next request.
  const redirectTo = (url: URL) => {
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // Couldn't reach Supabase (network blip, timeout, 5xx) — that is not a
  // sign-out. Let the page render; it re-checks the session itself.
  const hasAuthCookie = request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
  const transient = hasAuthCookie && isTransientAuthError(authError);
  if (isPortal && !user && transient) return response;

  if (isPortal && !user) {
    const url = request.nextUrl.clone();
    url.pathname = loginPathFor(request.cookies.get(LOGIN_BRAND_COOKIE)?.value);
    url.searchParams.set("redirect", path);
    return redirectTo(url);
  }

  // MFA enforcement: if user has TOTP enrolled but session is only AAL1, redirect to verify
  if (isPortal && user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa-verify";
      url.searchParams.set("redirect", path);
      return redirectTo(url);
    }
  }

  // No "signed in → /dashboard" bounce from /login: a user with a valid session
  // but no access (archived client, deactivated) is sent to /login by the portal
  // layout, and bouncing them back would loop. The login page handles it.

  return response;
}
