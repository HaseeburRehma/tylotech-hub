"use client";

import { useEffect } from "react";
import { useTheme } from "@/lib/theme/theme-provider";
import type { BrandTheme } from "@/lib/theme/themes";

/**
 * Applies a client's brand theme on mount via the ThemeProvider context.
 * Used on public pages (login, reset) where no user is signed in.
 * Runs after the ThemeProvider's own effect via setThemeOverride.
 */
export function ClientThemeApplier({ theme }: { theme: BrandTheme }) {
  const { setThemeOverride } = useTheme();

  useEffect(() => {
    // Small defer ensures this runs after ThemeProvider's initial effect
    const raf = requestAnimationFrame(() => {
      setThemeOverride(theme);
    });
    return () => cancelAnimationFrame(raf);
  }, [theme, setThemeOverride]);

  return null;
}
