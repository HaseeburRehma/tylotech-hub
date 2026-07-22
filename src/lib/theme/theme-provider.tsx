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
}: {
  children: React.ReactNode;
  /** The signed-in client's brand, built from their DB record. */
  initialTheme?: BrandTheme;
}) {
  // The switcher offers the built-in demo themes plus the live client brand.
  const allThemes = useMemo<BrandTheme[]>(
    () =>
      initialTheme && !THEMES.some((t) => t.id === initialTheme.id)
        ? [initialTheme, ...THEMES]
        : THEMES,
    [initialTheme],
  );

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

  const value = useMemo(
    () => ({ theme, themes: allThemes, setThemeById }),
    [theme, allThemes, setThemeById],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
