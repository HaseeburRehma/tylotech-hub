/**
 * Remembers which branded login (/<slug>/login) a user signed in through, so
 * sign-out and "session expired" redirects return them to their own branded page.
 */
export const LOGIN_BRAND_COOKIE = "tylo-login-brand";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

export const isBrandSlug = (v: string | null | undefined): v is string => !!v && SLUG_RE.test(v);

export function loginPathFor(slug: string | null | undefined) {
  return isBrandSlug(slug) ? `/${slug}/login` : "/login";
}

/** Client-side helpers. */
export function rememberLoginBrand(slug: string | null) {
  document.cookie = isBrandSlug(slug)
    ? `${LOGIN_BRAND_COOKIE}=${slug}; path=/; max-age=31536000; samesite=lax`
    : `${LOGIN_BRAND_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function currentLoginPath() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${LOGIN_BRAND_COOKIE}=([^;]*)`));
  return loginPathFor(m?.[1]);
}
