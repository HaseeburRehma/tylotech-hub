/**
 * White-label theme system.
 *
 * Each client stores a small theme object in the DB (primary_color, secondary_color,
 * logo_url, company_name). At runtime the ThemeProvider converts that object into the
 * set of RGB-channel CSS variables consumed by Tailwind, so the *entire* UI re-skins
 * with zero component changes.
 */

export type RGB = readonly [number, number, number];

export interface BrandTheme {
  /** Stable id, matches clients.id in the DB */
  id: string;
  /** Display name shown in the white-label switcher */
  name: string;
  /** Company name used across the portal */
  company: string;
  /** Logo: either an uploaded url or a built-in mark id */
  logo: { type: "mark" | "url"; value: string };
  /** Primary brand color (replaces Gold) */
  primary: RGB;
  /** Secondary / accent color (replaces Dark accent) */
  secondary: RGB;
  /** Whether brand color is light enough that text on it should be dark */
  onPrimaryDark?: boolean;
  tagline?: string;
}

export const TYLOTECH_THEME: BrandTheme = {
  id: "tylotech",
  name: "TyloTech",
  company: "TyloTech",
  logo: { type: "mark", value: "tylotech" },
  primary: [201, 168, 76], // #C9A84C gold
  secondary: [24, 22, 18],
  onPrimaryDark: true,
  tagline: "Growth, engineered.",
};

/** Real onboarded clients — used to preview white-label in the theme switcher. */
export const FAHRSCHULE_THEME: BrandTheme = {
  id: "fahrschule",
  name: "Fahrschule Abgefahrn",
  company: "Fahrschule Abgefahrn",
  logo: { type: "mark", value: "tylotech" },
  primary: [1, 254, 33], // neon green
  secondary: [14, 20, 10],
  onPrimaryDark: true,
  tagline: "Die bestbewertete Fahrschule.",
};

export const LIGHTOFHOPE_THEME: BrandTheme = {
  id: "lightofhope",
  name: "Light of Hope",
  company: "Light of Hope",
  logo: { type: "mark", value: "tylotech" },
  primary: [123, 44, 255], // purple
  secondary: [20, 16, 31],
  onPrimaryDark: true,
  tagline: "Dein Leuchtturm in der Dunkelheit.",
};

export const THEMES: BrandTheme[] = [TYLOTECH_THEME, FAHRSCHULE_THEME, LIGHTOFHOPE_THEME];

export const DEFAULT_THEME = TYLOTECH_THEME;

export function getTheme(id: string | null | undefined): BrandTheme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** Relative luminance to decide readable text color on a brand surface. */
export function isLight([r, g, b]: RGB): boolean {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6;
}

/** "#C9A84C" | "#abc" → [r,g,b] */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const int = parseInt(full || "000000", 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Build a runtime theme from a client's DB record (white-label core). */
export function buildClientTheme(opts: {
  id: string;
  company: string;
  primary: string;
  secondary: string;
  logoUrl?: string | null;
  tagline?: string;
}): BrandTheme {
  const primary = hexToRgb(opts.primary);
  return {
    id: opts.id,
    name: opts.company,
    company: opts.company,
    logo: opts.logoUrl ? { type: "url", value: opts.logoUrl } : { type: "mark", value: "tylotech" },
    primary,
    secondary: hexToRgb(opts.secondary),
    onPrimaryDark: isLight(primary),
    tagline: opts.tagline ?? "Powered by TyloTech",
  };
}

/** Produce the CSS variable map for a given theme. */
export function themeToCssVars(theme: BrandTheme): Record<string, string> {
  const onPrimaryDark = theme.onPrimaryDark ?? isLight(theme.primary);
  return {
    "--bg": "8 8 9",
    "--surface": "18 18 20",
    "--surface-2": "26 26 29",
    "--border": "38 38 42",
    "--foreground": "237 237 240",
    "--muted": "148 148 156",
    "--brand": theme.primary.join(" "),
    "--brand-foreground": onPrimaryDark ? "12 12 14" : "255 255 255",
    "--accent": theme.secondary.join(" "),
    "--success": "52 199 123",
    "--warning": "240 185 66",
    "--danger": "244 87 87",
    "--info": "96 165 250",
  };
}
