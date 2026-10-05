import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currency = "EUR") {
  // Small amounts (cost per lead, CPC) need cents; large ones read better rounded.
  const small = Math.abs(value) > 0 && Math.abs(value) < 100;
  return new Intl.NumberFormat("en-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: small ? 2 : 0,
    maximumFractionDigits: small ? 2 : 0,
  }).format(value);
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function formatRelativeTime(date: Date | string, locale?: string) {
  // Follows the UI language (<html lang>, set from the locale cookie).
  const lang = locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "de");
  const loc = lang === "en" ? "en-GB" : "de-DE";
  const d = typeof date === "string" ? new Date(date) : date;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto", style: "short" });
  if (mins < 1) return lang === "en" ? "just now" : "gerade eben";
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return d.toLocaleDateString(loc, { day: "numeric", month: "short" });
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
