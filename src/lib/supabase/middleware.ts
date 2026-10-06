import { LOGIN_BRAND_COOKIE, loginPathFor } from "@/lib/login-brand";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PORTAL_PREFIXES = [
  "/dashboard",
  "/performance",
  "/integrations",
  "/ai-tools",
  "/chat",
  "/documents",
  "/projects",
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
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPortal = PORTAL_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

  if (isPortal && !user) {
    const url = request.nextUrl.clone();
    url.pathname = loginPathFor(request.cookies.get(LOGIN_BRAND_COOKIE)?.value);
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // MFA enforcement: if user has TOTP enrolled but session is only AAL1, redirect to verify
  if (isPortal && user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/mfa-verify";
      url.searchParams.set("redirect", path);
      return NextResponse.redirect(url);
    }
  }

  // No "signed in → /dashboard" bounce from /login: a user with a valid session
  // but no access (archived client, deactivated) is sent to /login by the portal
  // layout, and bouncing them back would loop. The login page handles it.

  return response;
}
