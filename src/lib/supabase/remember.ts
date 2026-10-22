import type { CookieOptions } from "@supabase/ssr";

/**
 * "Stay signed in" (login checkbox). Checked (default): the session cookies
 * persist for 400 days and are refreshed on every visit, so people stay
 * signed in. Unchecked: the same cookies become browser-session cookies —
 * closing the browser signs you out. The preference itself is a small
 * non-secret cookie read wherever the auth cookies are written.
 */
export const REMEMBER_COOKIE = "tylohq_remember";
const YEAR = 400 * 24 * 60 * 60;

export const rememberFromValue = (v: string | undefined | null) => v !== "0";

/** Turn a persistent auth cookie into a session cookie when "stay signed in" is off. Deletions (maxAge 0) are kept. */
export function withRemember(options: CookieOptions | undefined, remember: boolean): CookieOptions {
  const o: CookieOptions = { ...(options ?? {}) };
  if (remember || o.maxAge === 0) return o;
  delete o.maxAge;
  delete o.expires;
  return o;
}

/** Browser: store the choice right before signing in. */
export function setRememberPreference(remember: boolean) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; Path=/; Max-Age=${YEAR}; SameSite=Lax${secure}`;
}
