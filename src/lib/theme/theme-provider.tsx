"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BrandTheme,
  DEFAULT_THEME,
  THEMES,
  themeToCssVars,
} from "./themes";

interface ThemeContextValue {
  theme: BrandTheme;
  themes: BrandTheme[];
  setThemeById: (id: string) => void;
  /** Apply an arbitrary brand theme (doesn't need to be in the list). */
  setThemeOverride: (theme: BrandTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "tylotech-hub:theme";

function applyVars(theme: BrandTheme) {
  if (typeof document === "undefined") return;
  const vars = themeToCssVars(theme);
  const root = document.documentElement;
  root.classList.add("theme-transition");
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  window.setTimeout(() => root.classList.remove("theme-transition"), 450);
}

export function ThemeProvider({
  children,
  initialTheme,
  brands,
}: {
  children: React.ReactNode;
  /** The signed-in client's brand, built from their DB record. */
  initialTheme?: BrandTheme;
  /** Live client brands (name + logo + colors) for the white-label switcher. */
  brands?: BrandTheme[];
}) {
  // Prefer the live client brands; fall back to the built-in demo themes.
  const allThemes = useMemo<BrandTheme[]>(() => {
    const base = brands && brands.length ? brands : THEMES;
    return initialTheme && !base.some((t) => t.id === initialTheme.id) ? [initialTheme, ...base] : base;
  }, [initialTheme, brands]);

  const [theme, setTheme] = useState<BrandTheme>(initialTheme ?? DEFAULT_THEME);

  useEffect(() => {
    // The logged-in brand always wins; otherwise honor a manual demo preference.
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const next =
      initialTheme ?? allThemes.find((t) => t.id === stored) ?? DEFAULT_THEME;
    setTheme(next);
    applyVars(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTheme]);

  const setThemeById = useCallback(
    (id: string) => {
      const next = allThemes.find((t) => t.id === id) ?? DEFAULT_THEME;
      setTheme(next);
      applyVars(next);
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next.id);
    },
    [allThemes],
  );

  const setThemeOverride = useCallback((override: BrandTheme) => {
    setTheme(override);
    applyVars(override);
  }, []);

  const value = useMemo(
    () => ({ theme, themes: allThemes, setThemeById, setThemeOverride }),
    [theme, allThemes, setThemeById, setThemeOverride],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
