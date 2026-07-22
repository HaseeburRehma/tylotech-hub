import type { Config } from "tailwindcss";

/**
 * Every brand color is exposed as an RGB-channel CSS variable (e.g. "201 168 76")
 * so Tailwind opacity modifiers keep working (bg-brand/10) while the actual values
 * are swapped at runtime by the white-label ThemeProvider.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          foreground: "rgb(var(--brand-foreground) / <alpha-value>)",
        },
        accent: "rgb(var(--accent) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--brand) / 0.25), 0 8px 40px -8px rgb(var(--brand) / 0.35)",
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 12px 40px -16px rgb(0 0 0 / 0.6)",
        float: "0 24px 70px -24px rgb(0 0 0 / 0.7)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, rgb(var(--brand)) 0%, rgb(var(--brand) / 0.7) 100%)",
        "surface-gradient":
          "linear-gradient(180deg, rgb(var(--surface) / 0.9) 0%, rgb(var(--surface) / 0.5) 100%)",
        grid: "linear-gradient(rgb(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.5) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "70%, 100%": { transform: "scale(1.6)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer: "shimmer 2s infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
