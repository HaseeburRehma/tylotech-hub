import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, type Locale } from "./dictionary";

/**
 * The UI language for server rendering: the saved choice (cookie), else the
 * browser's language (German browsers → de, others → en), else German. Every
 * server component must use this so it matches the client provider.
 */
export function serverLocale(): Locale {
  const saved = cookies().get(LOCALE_COOKIE)?.value as Locale | undefined;
  if (saved && LOCALES.includes(saved)) return saved;
  const accept = headers().get("accept-language");
  if (!accept) return DEFAULT_LOCALE;
  return /^\s*de\b/i.test(accept) ? "de" : "en";
}
