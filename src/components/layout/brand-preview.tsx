"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface BrandClient {
  id: string;
  company: string;
  primaryColor: string | null;
  isActive?: boolean;
}

export function BrandPreview() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<BrandClient[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const maxVisible = 8;

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/search?q=").catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.results) {
        const c = data.results
          .filter((r: { type: string }) => r.type === "Client")
          .map((r: { label: string; href: string; meta?: Record<string, string> }, i: number) => ({
            id: r.href,
            company: r.label,
            primaryColor: r.meta?.primaryColor ?? null,
            isActive: i === 0,
          }));
        setClients(c);
      }
    })();
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const visible = clients.slice(0, maxVisible);
  const remaining = Math.max(0, clients.length - maxVisible);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        aria-label={t("brand.title")}
      >
        <Palette className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 z-50 mt-2 w-[320px] rounded-2xl border border-border bg-surface shadow-float"
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-3">
              <p className="text-base font-semibold text-foreground">{t("brand.title")}</p>
              <p className="mt-1 text-xs text-muted leading-relaxed">{t("brand.desc")}</p>
            </div>

            {/* Client list */}
            <div className="max-h-[360px] overflow-y-auto px-2 pb-1">
              {visible.map((c) => (
                <button
                  key={c.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                    c.isActive && "bg-brand/[0.04]",
                  )}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: c.primaryColor || "rgb(var(--brand))" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{c.company}</span>
                    <span className="block text-[11px] text-muted">Powered by TyloTech</span>
                  </span>
                  {c.isActive && (
                    <Check className="h-4 w-4 shrink-0 text-brand" />
                  )}
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              {remaining > 0 && (
                <span className="text-xs text-muted">{t("brand.moreClients", { n: remaining })}</span>
              )}
              <span className="ml-auto text-xs font-medium text-muted">{t("brand.previewOnly")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
