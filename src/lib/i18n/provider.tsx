"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, translate, type Locale } from "./dictionary";

interface I18nCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      // Persist for SSR (cookie) so the default sticks across reloads.
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; SameSite=Lax`;
      try {
        localStorage.setItem(LOCALE_COOKIE, l);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = l;
      router.refresh(); // re-render server components (html lang, server-rendered text)
    },
    [router],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback so components never crash if used outside a provider.
    return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: (k) => translate(DEFAULT_LOCALE, k) };
  }
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useT() {
  return useI18n().t;
}
