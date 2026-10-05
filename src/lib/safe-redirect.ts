/**
 * Only allow same-origin, path-only redirects. Rejects protocol-relative URLs,
 * backslashes and control/whitespace characters (browsers strip tabs/newlines,
 * so "/\t/evil.com" would otherwise become "//evil.com").
 */
export function safeRedirect(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/.test(raw)) return fallback;
  return raw;
}
