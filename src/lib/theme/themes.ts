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
  /**
   * Brand colour for text/icons on light surfaces. Optional: derived from
   * `primary` so it reads on white (WCAG AA). TyloTech pins Figma's text/accent.
   */
  primaryInk?: RGB;
  /** Secondary / accent color (replaces Dark accent) */
  secondary: RGB;
  /** Whether brand color is light enough that text on it should be dark */
  onPrimaryDark?: boolean;
  tagline?: string;
  /** Full lockup image (mark + wordmark) — replaces mark+text when showName is true */
  fullLogo?: string;
  /** Variant of fullLogo for dark backgrounds */
  fullLogoDark?: string;
}

const LOGO_BASE = "https://gdofcdiekmazmjznlria.supabase.co/storage/v1/object/public/logos";

export const TYLOTECH_THEME: BrandTheme = {
  id: "tylotech",
  name: "TyloTech",
  company: "TyloTech",
  logo: { type: "mark", value: "tylotech" },
  primary: [209, 170, 113], // #D1AA71 gold (Figma surface/accent)
  primaryInk: [148, 113, 63], // #94713F (Figma text/accent) — gold is never text on white
  secondary: [24, 22, 18],
  onPrimaryDark: true,
  tagline: "Growth, engineered.",
  fullLogo: "/images/tylotech-logo.png",
  fullLogoDark: "/images/tylotech-logo-dark.png",
};

/** Real onboarded clients — used to preview white-label in the theme switcher. */
export const FAHRSCHULE_THEME: BrandTheme = {
  id: "fahrschule",
  name: "Fahrschule Abgefahrn",
  company: "Fahrschule Abgefahrn",
  logo: { type: "url", value: `${LOGO_BASE}/abgefahrn.svg` },
  primary: [1, 254, 33], // neon green
  secondary: [14, 20, 10],
  onPrimaryDark: true,
  tagline: "Die bestbewertete Fahrschule.",
};

export const LIGHTOFHOPE_THEME: BrandTheme = {
  id: "lightofhope",
  name: "Light of Hope",
  company: "Light of Hope",
  logo: { type: "url", value: `${LOGO_BASE}/light-of-hope.avif` },
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

/** WCAG relative luminance (0–1). */
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: RGB = [255, 255, 255];
/** Figma dark-section page surface (#002230). */
export const DARK_SURFACE: RGB = [0, 34, 48];

/**
 * The brand colour, darkened (or lightened) just enough to reach `ratio`
 * against `bg`. Keeps the hue, so a client's purple stays purple — only light
 * shades like gold or neon green get deeper when used as text.
 */
export function readableOn(color: RGB, bg: RGB, ratio = 4.5): RGB {
  if (contrast(color, bg) >= ratio) return color;
  const towardDark = luminance(bg) > 0.5;
  for (let step = 1; step <= 40; step++) {
    const f = step / 40;
    const c = color.map((v) => Math.round(towardDark ? v * (1 - f) : v + (255 - v) * f)) as unknown as RGB;
    if (contrast(c, bg) >= ratio) return c;
  }
  return towardDark ? [0, 0, 0] : WHITE;
}

/** Produce the CSS variable map for a given theme (light mode only — brand/accent). */
export function themeToCssVars(theme: BrandTheme): Record<string, string> {
  const onPrimaryDark = theme.onPrimaryDark ?? isLight(theme.primary);
  return {
    "--brand": theme.primary.join(" "),
    "--brand-foreground": onPrimaryDark ? "12 12 14" : "255 255 255",
    "--accent": theme.secondary.join(" "),
    // Text/icon variants of the brand; globals.css picks one per colour mode.
    "--brand-ink-light": (theme.primaryInk ?? readableOn(theme.primary, WHITE)).join(" "),
    "--brand-ink-dark": readableOn(theme.primary, DARK_SURFACE).join(" "),
  };
}
