"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const { theme, themes, setThemeById } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted transition-colors hover:border-brand/40 hover:text-foreground ring-focus"
        title="Switch white-label brand"
      >
        <Palette className="h-4 w-4 text-brand" />
        <span className="hidden sm:inline">White-label</span>
        <span
          className="h-3.5 w-3.5 rounded-full ring-2 ring-bg"
          style={{ background: `rgb(${theme.primary.join(" ")})` }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-border p-2 shadow-float"
          >
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-foreground">Brand theme</p>
              <p className="text-xs text-muted">
                Preview how the Hub re-skins per client.
              </p>
            </div>
            <div className="space-y-1">
              {themes.map((t) => {
                const active = t.id === theme.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setThemeById(t.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      active ? "bg-brand/10" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="flex gap-1">
                      <span
                        className="h-7 w-7 rounded-lg ring-1 ring-border"
                        style={{ background: `rgb(${t.primary.join(" ")})` }}
                      />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {t.company}
                      </span>
                      <span className="block text-xs text-muted">{t.tagline}</span>
                    </span>
                    {active && <Check className="h-4 w-4 text-brand" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
