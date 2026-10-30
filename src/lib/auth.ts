import { cache } from "react";
import { Role } from "@/types";
import { bearerToken, createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isTransientAuthError } from "@/lib/supabase/session-errors";
import { wantsLeadEmail } from "@/lib/leads-shared";
import { TYLOTECH_GOLD } from "@/lib/theme/themes";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  client_id: string | null;
  company: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  title: string | null;
  avatarUrl: string | null;
  /** Email notifications for new messages/files (opt-out, stored in auth metadata). */
  notifyEmail: boolean;
  /** An email for every new lead (partners: on by default, staff: off; auth metadata). */
  leadEmail: boolean;
}

/** Demo identity used only when Supabase isn't configured. */
export const DEMO_USER: AuthUser = {
  id: "demo",
  email: "demo@tylotech.de",
  name: "Demo Client",
  role: "client",
  client_id: "demo",
  company: "Demo Client",
  primaryColor: TYLOTECH_GOLD,
  secondaryColor: "#181612",
  logoUrl: null,
  title: null,
  avatarUrl: null,
  notifyEmail: true,
  leadEmail: true,
};

/**
 * Resolves the current user + tenant + brand. Memoized per request via React cache
 * so layout + page can both call it without a second round-trip.
 */
/** TEMP (perf measurement): per-step auth timings for the Server-Timing header. */
export const authTimings = new WeakMap<AuthUser, string>();

export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (!isSupabaseConfigured) return DEMO_USER;
  const t0 = Date.now();
  let tUser = 0;
  let tProfile = 0;

  const supabase = createClient();
  if (!supabase) return null;

  // Mobile app requests carry the access token instead of cookies. For cookie
  // sessions, read the token from the session (local; middleware refreshed it).
  let token = bearerToken();
  if (!token) {
    const { data, error } = await supabase.auth.getSession();
    if (!data.session && isTransientAuthError(error)) {
      throw new Error("Authentication service temporarily unavailable");
    }
    token = data.session?.access_token ?? null;
  }
  if (!token) return null;
  const tSession = Date.now() - t0;
  const claimedId = jwtClaim(token, "sub");
  if (typeof claimedId !== "string" || !claimedId) return null;

  // The Auth server check and the profile read run side by side: one round trip
  // instead of two. The profile read runs under RLS with this same token, and
  // only counts once the server has confirmed the token belongs to that user.
  const [
    {
      data: { user },
      error: authError,
    },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase.auth.getUser(token).finally(() => (tUser = Date.now() - t0)),
    supabase
      .from("users")
      // `*` keeps this tolerant of columns added by later migrations (title, avatar_url, deactivated_at…).
      .select("*, clients(*)")
      .eq("id", claimedId)
      .single()
      .then((r) => ((tProfile = Date.now() - t0), r)),
  ]);
  // Supabase unreachable (network, timeout, 5xx) is not "signed out": fail this
  // request (error page with retry) instead of sending the user to the login.
  if (!user && isTransientAuthError(authError)) {
    throw new Error("Authentication service temporarily unavailable");
  }
  if (!user || user.id !== claimedId) return null;

  // Users with 2FA enrolled must complete it before any server code (pages or
  // API routes) treats them as signed in — a password alone is not enough. Both
  // the factors and the level come from what the Auth server just verified,
  // never from the session cookie (which the browser can edit).
  const hasFactor = (user.factors ?? []).some((f) => f.status === "verified");
  if (hasFactor && jwtClaim(token, "aal") !== "aal2") return null;

  // "No row" means no access; anything else (timeout, 5xx) is temporary.
  if (!profile && profileError && profileError.code !== "PGRST116") {
    throw new Error("Profile temporarily unavailable");
  }
  if (!profile) return null;

  const client = Array.isArray(profile.clients) ? profile.clients[0] : profile.clients;

  // Deactivated staff and users of archived clients lose access (columns from 0030).
  if (profile.deactivated_at) return null;
  if (profile.role === "client" && client?.archived_at) return null;

  const result: AuthUser = {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role as Role,
    client_id: profile.client_id,
    company: client?.company ?? null,
    primaryColor: client?.primary_color ?? null,
    secondaryColor: client?.secondary_color ?? null,
    logoUrl: client?.logo_url ?? null,
    title: profile.title ?? null,
    avatarUrl: profile.avatar_url ?? null,
    notifyEmail: user.user_metadata?.notify_email !== false,
    leadEmail: wantsLeadEmail(profile.role, user.user_metadata),
  };
  authTimings.set(result, `a_session;dur=${tSession}, a_user;dur=${tUser}, a_profile;dur=${tProfile}`);
  return result;
});

/** Read one claim from a JWT; trusted only once getUser above has verified that token. */
function jwtClaim(token: string, claim: string): unknown {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return payload?.[claim];
  } catch {
    return undefined;
  }
}

export function isStaff(user: AuthUser | null): boolean {
  // Pure role check — no demo-mode bypass. DEMO_USER is role "client", so
  // staff-gated actions correctly stay unavailable when the backend isn't
  // configured, instead of trusting every caller as staff.
  return user?.role === "admin" || user?.role === "team";
}
