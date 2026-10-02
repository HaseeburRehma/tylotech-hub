export const ACTIVE_CLIENT_COOKIE = "tylo-active-client";

/** Persist the staff member's selected client (slug or id) so server pages can scope to it. */
export function writeActiveClientCookie(ref: string) {
  document.cookie = `${ACTIVE_CLIENT_COOKIE}=${encodeURIComponent(ref)}; path=/; max-age=31536000; samesite=lax`;
}
