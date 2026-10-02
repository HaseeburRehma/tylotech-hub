"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { useTheme } from "@/lib/theme/theme-provider";
import { TYLOTECH_THEME } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

export function BrandPreview() {
  const t = useT();
  const { theme, themes, setThemeById } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const previewing = theme.id !== TYLOTECH_THEME.id;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("brand.title")}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-foreground",
          previewing ? "text-brand" : "text-muted",
        )}
      >
        <Palette className="h-4 w-4" />
        {previewing && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-4 top-16 z-[60] rounded-2xl border border-border bg-surface shadow-float lg:absolute lg:inset-x-auto lg:left-0 lg:top-auto lg:mt-2 lg:w-[320px]"
          >
            <div className="px-5 pb-3 pt-4">
              <p className="text-base font-semibold text-foreground">{t("brand.title")}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t("brand.desc")}</p>
            </div>

            <div className="max-h-[360px] overflow-y-auto px-2 pb-1">
              {themes.map((b) => {
                const active = b.id === theme.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setThemeById(b.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                      active && "bg-brand/[0.06]",
                    )}
                  >
                    <span
                      className="h-8 w-8 shrink-0 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: `rgb(${b.primary.join(" ")})` }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{b.company}</span>
                      <span className="block text-[11px] text-muted">
                        {b.id === TYLOTECH_THEME.id ? TYLOTECH_THEME.tagline : "Powered by TyloTech"}
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-brand" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              {previewing ? (
                <button
                  type="button"
                  onClick={() => setThemeById(TYLOTECH_THEME.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("brand.reset")}
                </button>
              ) : (
                <span />
              )}
              <span className="text-xs font-medium text-muted">{t("brand.previewOnly")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
