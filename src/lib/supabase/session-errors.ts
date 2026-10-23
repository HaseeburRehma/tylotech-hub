/**
 * Distinguishes "Supabase couldn't be reached" from "this session is invalid".
 * Only the second may sign someone out: a network blip, timeout or Supabase 5xx
 * must never bounce a signed-in user to the login page — and a dead session
 * must never be mistaken for an outage (the user would sit on an error page).
 */

// Session problems that carry a 5xx/absent status but mean "not signed in".
const SESSION_GONE = new Set(["AuthSessionMissingError", "AuthInvalidTokenResponseError"]);

export function isTransientAuthError(
  error: { name?: string; status?: number; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.name && SESSION_GONE.has(error.name)) return false;
  if (!error.status || error.status >= 500) return true;
  return /fetch|network|timeout|timed out|ECONN|ETIMEDOUT/i.test(error.message ?? "");
}
