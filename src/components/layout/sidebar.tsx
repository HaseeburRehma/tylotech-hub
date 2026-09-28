"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CLIENT_NAV, INTERNAL_NAV } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ChevronDown, Settings } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { AccountMenu } from "./account-menu";
import { BrandPreview } from "./brand-preview";
import type { SidebarClient } from "./app-shell";

const ROLE_LABEL: Record<string, string> = {
  admin: "Super Admin",
  team: "TyloTech Team",
  client: "Client",
};

function ClientSwitcher({ clients }: { clients: SidebarClient[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = clients[0];
  if (!selected) return null;

  return (
    <div ref={ref} className="relative mx-3 mb-2">
      <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
        {t("nav.client") ?? "Kunde"}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-surface-2 ring-focus"
      >
        <Avatar name={selected.name} size={28} />
        <span className="flex-1 truncate text-left font-medium text-foreground">
          {selected.name}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-float">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpen(false)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface-2",
                c.id === selected.id && "bg-brand/8 text-foreground",
              )}
            >
              {c.logoUrl ? (
                <img src={c.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
              ) : (
                <Avatar name={c.name} size={24} />
              )}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavList({
  onNavigate,
  canSeeInternal,
  clients,
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
  clients: SidebarClient[];
}) {
  const pathname = usePathname();
  const t = useT();

  const allHrefs = [
    ...CLIENT_NAV.map((i) => i.href),
    ...INTERNAL_NAV.map((i) => i.href),
  ];
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

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
            active ? "text-foreground font-medium" : "text-muted hover:text-foreground hover:bg-surface-2",
          )}
        >
          {active && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-xl bg-brand/8 ring-1 ring-brand/15"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className={cn("h-[18px] w-[18px]", active && "text-brand")} />
          <span className="flex-1">{t(item.label)}</span>
        </Link>
      );
    });

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
      <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
        {t("nav.workspace")}
      </p>
      {render(CLIENT_NAV)}

      {canSeeInternal && (
        <>
          <p className="px-3 pb-1.5 pt-5 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
            {t("nav.tylotech")}
          </p>
          {render(INTERNAL_NAV)}
        </>
      )}
    </nav>
  );
}

function UserProfile() {
  const user = useUser();

  return (
    <div className="m-3 mt-auto shrink-0">
      <div className="flex items-center gap-3 rounded-xl p-2">
        <Avatar name={user.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted">
            {ROLE_LABEL[user.role] ?? user.role}
          </p>
        </div>
        <AccountMenu />
      </div>
    </div>
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
    <aside className="flex h-full w-[260px] flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 px-5">
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          {canSeeInternal && <BrandPreview />}
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {canSeeInternal && clients.length > 0 && (
        <ClientSwitcher clients={clients} />
      )}

      <NavList onNavigate={onNavigate} canSeeInternal={canSeeInternal} clients={clients} />

      <UserProfile />
    </aside>
  );
}
