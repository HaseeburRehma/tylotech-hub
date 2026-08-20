"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CLIENT_NAV, INTERNAL_NAV } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkles, Building2, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useUnreadHrefs } from "@/lib/hooks/use-unread";
import type { SidebarClient } from "./app-shell";

function NavList({
  onNavigate,
  canSeeInternal,
  userId,
  clients,
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
  userId: string;
  clients: SidebarClient[];
}) {
  const pathname = usePathname();
  const t = useT();
  const { hrefs: unreadHrefs, reload } = useUnreadHrefs(userId);
  const clientHref = (id: string) => `/internal/clients/${id}`;
  const onClientPage = pathname.startsWith("/internal/clients/");
  const [clientsOpen, setClientsOpen] = useState(false);
  useEffect(() => {
    if (onClientPage) setClientsOpen(true);
  }, [onClientPage]);

  // Longest-prefix match so /internal/projects highlights "Projects", not "Internal Hub".
  // Client rows are included so a client's messages attribute to THAT client's row.
  const allHrefs = [
    ...CLIENT_NAV.map((i) => i.href),
    ...INTERNAL_NAV.map((i) => i.href),
    ...clients.map((c) => clientHref(c.id)),
  ];
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  // Real unread badge per item: count unread notifications whose link lives under
  // this item, attributing each to its LONGEST-matching href.
  const countFor = (href: string) =>
    unreadHrefs.filter((h) => {
      const best = allHrefs
        .filter((n) => h === n || h.startsWith(n + "/"))
        .sort((a, b) => b.length - a.length)[0];
      return best === href;
    }).length;
  const clientsTotal = clients.reduce((sum, c) => sum + countFor(clientHref(c.id)), 0);

  // Opening a section clears its badge: mark its unread notifications read.
  useEffect(() => {
    if (!activeHref) return;
    const hasUnread = unreadHrefs.some((h) => h === activeHref || h.startsWith(activeHref + "/"));
    if (!hasUnread) return;
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hrefPrefix: activeHref }),
    })
      .then(() => reload())
      .catch(() => {});
  }, [activeHref, unreadHrefs, reload]);

  const badge = (count: number) =>
    count > 0 ? (
      <Badge variant="brand" className="px-1.5 py-0.5 text-[10px]">
        {count > 9 ? "9+" : count}
      </Badge>
    ) : null;

  const render = (items: typeof CLIENT_NAV) =>
    items.map((item) => {
      const active = item.href === activeHref;
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ring-focus",
            active ? "text-foreground" : "text-muted hover:text-foreground hover:bg-surface-2",
          )}
        >
          {active && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-xl bg-brand/10 ring-1 ring-brand/20"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className={cn("h-[18px] w-[18px]", active && "text-brand")} />
          <span className="flex-1 font-medium">{t(item.label)}</span>
          {badge(countFor(item.href))}
        </Link>
      );
    });

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
      <p className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
        {t("nav.workspace")}
      </p>
      {render(CLIENT_NAV)}
      {canSeeInternal && (
        <>
          <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
            {t("nav.tylotech")}
          </p>
          {render(INTERNAL_NAV)}

          {clients.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setClientsOpen((o) => !o)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground ring-focus"
              >
                <Building2 className="h-[18px] w-[18px]" />
                <span className="flex-1 text-left font-medium">{t("nav.clients")}</span>
                {!clientsOpen && badge(clientsTotal)}
                <ChevronDown className={cn("h-4 w-4 transition-transform", clientsOpen && "rotate-180")} />
              </button>

              {clientsOpen && (
                <div className="mt-0.5 space-y-0.5 pl-3">
                  {clients.map((c) => {
                    const href = clientHref(c.id);
                    const active = href === activeHref;
                    const count = countFor(href);
                    return (
                      <Link
                        key={c.id}
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ring-focus",
                          active ? "bg-brand/10 text-foreground ring-1 ring-brand/20" : "text-muted hover:bg-surface-2 hover:text-foreground",
                        )}
                      >
                        {c.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
                        ) : (
                          <Avatar name={c.name} size={24} />
                        )}
                        <span className="flex-1 truncate">{c.name}</span>
                        {count > 0 && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-brand" title={`${count} new`} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </nav>
  );
}

export function Sidebar({
  onNavigate,
  canSeeInternal,
  userId,
  clients = [],
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
  userId: string;
  clients?: SidebarClient[];
}) {
  const t = useT();
  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-border bg-surface/40">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>

      <NavList onNavigate={onNavigate} canSeeInternal={canSeeInternal} userId={userId} clients={clients} />

      <div className="m-3 mt-auto shrink-0 rounded-2xl border border-brand/20 bg-brand/[0.06] p-4">
        <div className="mb-1.5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold text-foreground">{t("nav.unlockAi")}</span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">{t("nav.unlockAiDesc")}</p>
        <Link
          href="/ai-tools"
          onClick={onNavigate}
          className="inline-flex text-xs font-semibold text-brand hover:underline"
        >
          {t("nav.viewAddons")}
        </Link>
      </div>
    </aside>
  );
}
