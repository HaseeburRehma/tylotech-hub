"use client";

import { useI18n } from "@/lib/i18n/provider";
import { LOCALES, type Locale } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex gap-0.5 rounded-lg bg-line/80 p-[3px] font-mono text-[10.5px] font-medium",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-md px-2 py-0.5 uppercase transition-colors",
            locale === l ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
          )}
          title={l === "de" ? "Deutsch" : "English"}
        >
          {l}
        </button>
      ))}
    </span>
  );
}
