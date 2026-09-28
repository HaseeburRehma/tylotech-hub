"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  CirclePlus,
  Command,
  CornerDownLeft,
  FileUp,
  LineChart,
  Plug,
  Search,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLIENT_NAV } from "@/lib/nav";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface CmdItem {
  id: string;
  group: "clients" | "actions" | "pages";
  label: string;
  desc: string;
  icon: React.ElementType;
  href?: string;
  action?: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [clients, setClients] = useState<{ id: string; name: string; desc: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/search?q=").catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.results) {
        const c = data.results
          .filter((r: { type: string }) => r.type === "Client")
          .map((r: { label: string; href: string }) => ({
            id: r.href,
            name: r.label,
            desc: "",
          }));
        setClients(c);
      }
    })();
  }, []);

  const items: CmdItem[] = [];

  const matchingClients = clients.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );
  for (const c of matchingClients.slice(0, 4)) {
    items.push({
      id: `client-${c.id}`,
      group: "clients",
      label: c.name,
      desc: c.desc,
      icon: Building2,
      href: c.id,
    });
  }

  const actions: CmdItem[] = [
    {
      id: "action-new-client",
      group: "actions",
      label: t("cmd.newClient"),
      desc: t("cmd.newClientDesc"),
      icon: CirclePlus,
      href: "/internal/clients",
    },
    {
      id: "action-create-ads",
      group: "actions",
      label: t("cmd.createAds"),
      desc: t("cmd.createAdsDesc", { client: matchingClients[0]?.name ?? "" }),
      icon: Sparkles,
      href: "/ai-tools",
    },
    {
      id: "action-upload-doc",
      group: "actions",
      label: t("cmd.uploadDoc"),
      desc: t("cmd.uploadDocDesc"),
      icon: FileUp,
      href: "/documents",
    },
  ];
  for (const a of actions) {
    if (!query || a.label.toLowerCase().includes(query.toLowerCase())) {
      items.push(a);
    }
  }

  const pageIcons: Record<string, React.ElementType> = {
    "/performance": LineChart,
    "/integrations": Plug,
  };
  for (const nav of CLIENT_NAV) {
    if (!query || t(nav.label).toLowerCase().includes(query.toLowerCase())) {
      items.push({
        id: `page-${nav.href}`,
        group: "pages",
        label: t(nav.label),
        desc: "",
        icon: pageIcons[nav.href] ?? nav.icon,
        href: nav.href,
      });
    }
  }

  const groups = ["clients", "actions", "pages"] as const;
  const groupLabels = {
    clients: t("cmd.clients"),
    actions: t("cmd.actions"),
    pages: t("cmd.pages"),
  };

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!o) {
        setQuery("");
        setActiveIdx(0);
      }
      return !o;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, toggle]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function go(item: CmdItem) {
    setOpen(false);
    if (item.action) item.action();
    else if (item.href) router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[activeIdx]) {
      e.preventDefault();
      go(items[activeIdx]);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-foreground/25 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed inset-x-0 top-[15%] z-[61] mx-auto w-full max-w-xl"
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-bg shadow-float">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Search className="h-5 w-5 text-muted" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t("cmd.placeholder")}
                  className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted/60"
                />
                <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline-block">
                  esc
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {groups.map((group) => {
                  const groupItems = items.filter((i) => i.group === group);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={group} className="mb-2 last:mb-0">
                      <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
                        {groupLabels[group]}
                      </p>
                      {groupItems.map((item) => {
                        const idx = items.indexOf(item);
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => go(item)}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                              idx === activeIdx
                                ? "bg-surface-2"
                                : "hover:bg-surface",
                            )}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {item.label}
                              </span>
                              {item.desc && (
                                <span className="block truncate text-xs text-muted">
                                  {item.desc}
                                </span>
                              )}
                            </span>
                            {idx === activeIdx && (
                              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  <ArrowDown className="h-3 w-3" />
                  {t("cmd.navigate")}
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" />
                  {t("cmd.open")}
                </span>
                <span className="flex items-center gap-1">
                  <Command className="h-3 w-3" />K{" "}
                  {t("cmd.close")}
                </span>
                <span className="ml-auto">
                  {t("cmd.hits", { n: items.length })}
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
