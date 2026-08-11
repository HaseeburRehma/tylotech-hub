"use client";

import { useI18n } from "@/lib/i18n/provider";
import { LOCALES, type Locale } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex overflow-hidden rounded-lg border border-border bg-surface-2 text-[11px] font-semibold",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "px-2 py-1 uppercase transition-colors",
            locale === l ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
          )}
          title={l === "de" ? "Deutsch" : "English"}
        >
          {l}
        </button>
      ))}
    </span>
  );
}
