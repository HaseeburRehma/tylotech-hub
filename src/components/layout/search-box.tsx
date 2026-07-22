"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileText, FolderKanban, Loader2, Newspaper, Building2, Search, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Hit {
  type: "Document" | "Project" | "Update" | "Client";
  label: string;
  href: string;
}

const ICON: Record<Hit["type"], LucideIcon> = {
  Document: FileText,
  Project: FolderKanban,
  Update: Newspaper,
  Client: Building2,
};

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
      if (res?.ok) setHits((await res.json()).results ?? []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    router.push(h.href);
  }

  return (
    <div ref={ref} className="relative hidden flex-1 md:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search reports, documents, projects…"
        className="h-10 w-full max-w-md rounded-xl border border-border bg-surface/60 pl-10 pr-4 text-sm text-foreground placeholder:text-muted/60 outline-none transition-colors focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted md:right-[calc(100%-28rem)]" />}

      <AnimatePresence>
        {open && q.trim().length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
            className="glass absolute left-0 z-50 mt-2 w-full max-w-md rounded-2xl border border-border p-1.5 shadow-float"
          >
            {hits.length === 0 && !loading ? (
              <p className="px-3 py-4 text-center text-sm text-muted">No matches for “{q}”.</p>
            ) : (
              hits.map((h, i) => {
                const Icon = ICON[h.type];
                return (
                  <button
                    key={i}
                    onClick={() => go(h)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{h.label}</span>
                      <span className={cn("text-[11px] text-muted")}>{h.type}</span>
                    </span>
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
