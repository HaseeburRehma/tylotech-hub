"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CLIENT_NAV, INTERNAL_NAV } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Globe,
  KeyRound,
  LogOut,
  Mail,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useT, useI18n } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { createClient } from "@/lib/supabase/client";
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

function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme-mode", next ? "dark" : "light"); } catch {}
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        dark ? "bg-brand" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
          dark ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function SidebarBottomItems({ canSeeInternal }: { canSeeInternal: boolean }) {
  const t = useT();
  const router = useRouter();
  const { locale, setLocale } = useI18n();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  const linkClass =
    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:text-foreground hover:bg-surface-2";

  return (
    <div className="mx-3 shrink-0 space-y-0.5 border-t border-border pt-3">
      {/* Hook E-Mail */}
      <a href="mailto:hook@tylotech.de" className={linkClass}>
        <Mail className="h-[18px] w-[18px]" />
        <span className="flex-1">Hook E-Mail</span>
      </a>

      {/* Settings */}
      <Link href="/settings" className={linkClass}>
        <Settings className="h-[18px] w-[18px]" />
        <span className="flex-1">{t("account.settings")}</span>
      </Link>

      {/* Language */}
      <button
        type="button"
        onClick={() => setLocale(locale === "de" ? "en" : "de")}
        className={cn(linkClass, "w-full")}
      >
        <Globe className="h-[18px] w-[18px]" />
        <span className="flex-1">{t("account.language")}</span>
        <span className="text-xs text-muted">{locale === "de" ? "Deutsch" : "English"}</span>
      </button>

      {/* Dark mode */}
      <div className={cn(linkClass, "cursor-default")}>
        <Moon className="h-[18px] w-[18px]" />
        <span className="flex-1">{t("sidebar.darkMode")}</span>
        <DarkModeToggle />
      </div>

      {/* Admin settings */}
      {canSeeInternal && (
        <Link href="/internal" className={linkClass}>
          <KeyRound className="h-[18px] w-[18px]" />
          <span className="flex-1">{t("sidebar.adminAccess")}</span>
        </Link>
      )}

      {/* Sign out */}
      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
      >
        <LogOut className="h-[18px] w-[18px]" />
        <span className="flex-1 text-left">{t("account.signOut")}</span>
      </button>
    </div>
  );
}

function UserProfile() {
  const user = useUser();

  return (
    <div className="m-3 mt-2 shrink-0">
      <div className="flex items-center gap-3 rounded-xl p-2">
        <Avatar name={user.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted">
            {ROLE_LABEL[user.role] ?? user.role}
          </p>
        </div>
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
        </div>
      </div>

      {canSeeInternal && clients.length > 0 && (
        <ClientSwitcher clients={clients} />
      )}

      <NavList onNavigate={onNavigate} canSeeInternal={canSeeInternal} clients={clients} />

      <SidebarBottomItems canSeeInternal={canSeeInternal} />
      <UserProfile />
    </aside>
  );
}
