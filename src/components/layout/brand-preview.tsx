"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/provider";
import { useTheme } from "@/lib/theme/theme-provider";
import { TYLOTECH_THEME, type BrandTheme } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

const rgb = (c: readonly number[]) => `rgb(${c.join(" ")})`;
const PANEL_W = 340;
const GAP = 8;
const EDGE = 16;

/** A client's logo; brands without an image logo get a tile in their colour with their initial. */
function BrandMark({ brand }: { brand: BrandTheme }) {
  const [broken, setBroken] = useState(false);
  if (brand.logo.type === "url" && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={brand.logo.value} alt="" onError={() => setBroken(true)} className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-border" />
    );
  }
  if (brand.id === TYLOTECH_THEME.id) {
    // TyloTech's own mark, always in its gold (not the brand being previewed).
    const gold = rgb(TYLOTECH_THEME.primary);
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
          {[
            [4, 20, 0.45],
            [4, 12, 0.65],
            [12, 12, 0.85],
            [12, 4, 1],
            [20, 4, 0.65],
          ].map(([x, y, o]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="1.5" fill={gold} opacity={o} />
          ))}
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white ring-1 ring-border" style={{ backgroundColor: rgb(brand.primary) }}>
      {brand.company.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function BrandPreview() {
  const t = useT();
  const { theme, themes, setThemeById } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel lives at the end of <body> (a portal): inside the sidebar the page
  // content painted over it. Placed under the button, kept inside the window.
  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(PANEL_W, window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(EDGE, r.left), window.innerWidth - width - EDGE);
    const top = r.bottom + GAP;
    setPos({ top, left, width, maxHeight: Math.max(240, window.innerHeight - top - EDGE) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !btnRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const previewing = theme.id !== TYLOTECH_THEME.id;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("brand.title")}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-foreground",
          previewing ? "text-brand-ink" : "text-muted",
          open && "bg-surface-2 text-foreground",
        )}
      >
        <Palette className="h-4 w-4" />
        {previewing && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label={t("brand.title")}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
                className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-float"
              >
                <div className="shrink-0 px-5 pb-3 pt-4">
                  <p className="text-base font-semibold text-foreground">{t("brand.title")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t("brand.desc")}</p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
                  {themes.map((b) => {
                    const active = b.id === theme.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setThemeById(b.id)}
                        aria-pressed={active}
                        className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", active && "bg-brand/[0.08]")}
                      >
                        <BrandMark brand={b} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">{b.company}</span>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: rgb(b.primary) }} title={t("brand.title")} />
                          </span>
                          <span className="block truncate text-caption text-muted">{b.id === TYLOTECH_THEME.id ? TYLOTECH_THEME.tagline : "Powered by TyloTech"}</span>
                        </span>
                        {active && <Check className="h-4 w-4 shrink-0 text-brand-ink" />}
                      </button>
                    );
                  })}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
                  {previewing ? (
                    <button type="button" onClick={() => setThemeById(TYLOTECH_THEME.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink hover:underline">
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
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
