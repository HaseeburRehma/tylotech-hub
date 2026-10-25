"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CLIENT_NAV, INTERNAL_NAV } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { currentLoginPath } from "@/lib/login-brand";
import { hexToRgb, isLight } from "@/lib/theme/themes";
import {
  Check,
  ChevronDown,
  Clock,
  Globe,
  Keyboard,
  KeyRound,
  LifeBuoy,
  LogOut,
  Moon,
  MoreHorizontal,
  Search,
  Settings,
} from "lucide-react";
import { useT, useI18n } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { useActiveClient } from "@/components/providers/active-client-provider";
import { WAITING_ALERT_HOURS, useInbox, waitedFor } from "@/components/chat/inbox-provider";
import { createClient } from "@/lib/supabase/client";
import { BrandPreview } from "./brand-preview";
import { NotificationsBell } from "./notifications-bell";
import { useLogoTone } from "@/lib/logo-tone";
import type { SidebarClient } from "./app-shell";
import { Switch } from "@/components/ui/switch";

const ROLE_LABEL: Record<string, string> = {
  admin: "Super Admin",
  team: "TyloTech Team",
  client: "Client",
};

export function ClientLogo({ client, size }: { client: SidebarClient; size: number }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const tone = useLogoTone(client.logoUrl);
  const rgb = client.color ? hexToRgb(client.color) : null;
  if (client.logoUrl && !logoFailed) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, padding: Math.max(2, Math.round(size * 0.12)) }}
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-border",
          tone === "light" ? "bg-[#18181b]" : "bg-white",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.logoUrl} alt="" onError={() => setLogoFailed(true)} className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        backgroundColor: rgb ? `rgb(${rgb.join(" ")})` : undefined,
        color: rgb ? (isLight(rgb) ? "#0c0c0e" : "#ffffff") : undefined,
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-semibold",
        !rgb && "bg-brand text-brand-foreground",
      )}
    >
      {client.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Unread count pill (99+), or nothing. */
function UnreadPill({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("min-w-[20px] rounded-full bg-brand px-1.5 py-px text-center text-eyebrow font-bold leading-4 text-brand-foreground", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Clock shown when a partner has been waiting for a reply longer than the alert threshold. */
function WaitingClock({ since }: { since: string | null }) {
  const { locale } = useI18n();
  const t = useT();
  if (!since || Date.now() - new Date(since).getTime() < WAITING_ALERT_HOURS * 3_600_000) return null;
  const label = t("inbox.waiting", { time: waitedFor(since, locale) });
  return (
    <span title={label} aria-label={label} className="flex items-center gap-0.5 text-eyebrow font-semibold text-danger">
      <Clock className="h-3 w-3" />
      {waitedFor(since, locale)}
    </span>
  );
}

function ClientSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { clients, active, setActive } = useActiveClient();
  const inbox = useInbox();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!active) return null;

  const q = query.trim().toLowerCase();
  // Partners with unread messages or waiting for a reply first, then the usual order.
  const score = (c: SidebarClient) => {
    const e = inbox.byClient[c.id];
    return e ? (e.unread ? 2 : 0) + (inbox.overdue.some((o) => o.clientId === c.id) ? 1 : 0) : 0;
  };
  const visible = (q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients)
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
  const otherUnread = clients.reduce((n, c) => n + (c.id === active.id ? 0 : inbox.byClient[c.id]?.unread ?? 0), 0);
  const otherWaiting = inbox.overdue.filter((o) => o.clientId !== active.id).length;

  function pick(c: SidebarClient) {
    setOpen(false);
    if (c.id !== active?.id) setActive(c);
    onNavigate?.();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-[11px] border border-line bg-bg py-2 pl-2 pr-2.5 transition-colors hover:border-border ring-focus"
      >
        <ClientLogo client={active} size={26} />
        <span className="min-w-0 flex-1 text-left">
          <span className="eyebrow block">{t("nav.client")}</span>
          <span className="block truncate font-display text-sm font-medium leading-[19px] text-foreground">{active.name}</span>
        </span>
        {otherWaiting > 0 && (
          <span title={t("inbox.othersWaiting", { n: otherWaiting })} className="flex items-center text-danger">
            <Clock className="h-3.5 w-3.5" />
          </span>
        )}
        <UnreadPill n={otherUnread} />
        <ChevronDown className={cn("h-[15px] w-[15px] text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-line bg-surface p-1 shadow-float">
          {clients.length > 6 && (
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && visible[0]) pick(visible[0]);
                }}
                placeholder={t("nav.searchClient")}
                className="w-full rounded-lg bg-surface-2 py-2 pl-8 pr-2.5 text-sm text-foreground outline-none placeholder:text-muted/70"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {visible.map((c) => {
              const selected = c.id === active.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(c)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-bg",
                      selected ? "bg-brand-subtle font-medium text-foreground" : "text-soft hover:text-foreground",
                    )}
                  >
                    <ClientLogo client={c} size={24} />
                    <span className={cn("flex-1 truncate text-left", inbox.byClient[c.id]?.unread && "font-semibold text-foreground")}>{c.name}</span>
                    <WaitingClock since={inbox.byClient[c.id]?.waitingSince ?? null} />
                    <UnreadPill n={inbox.byClient[c.id]?.unread ?? 0} />
                    {selected && <Check className="h-4 w-4 shrink-0 text-brand-ink" />}
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="px-2.5 py-3 text-center text-xs text-muted">{t("nav.noClientMatch")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function NavList({
  onNavigate,
  canSeeInternal,
  clients,
  navBadges = {},
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
  clients: SidebarClient[];
  navBadges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const t = useT();
  const inbox = useInbox();
  const { active } = useActiveClient();
  const activeUnread = active ? inbox.byClient[active.id]?.unread ?? 0 : 0;

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
            "group relative flex h-10 shrink-0 items-center gap-[11px] rounded-[10px] px-3 font-display text-title font-medium tracking-[-0.01em] transition-colors ring-focus",
            active ? "text-foreground" : "text-soft hover:bg-bg hover:text-foreground",
          )}
        >
          {active && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-[10px] bg-brand-subtle"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-brand-icon" : "text-muted group-hover:text-soft")} strokeWidth={1.75} />
          <span className="flex-1 truncate">{t(item.label)}</span>
          {item.href === "/chat" && <UnreadPill n={activeUnread} />}
          {navBadges[item.href] != null && navBadges[item.href]! > 0 && (
            <span className="min-w-[20px] rounded-full bg-surface-2 px-1.5 py-px text-center text-eyebrow font-bold leading-4 text-muted">
              {navBadges[item.href]}
            </span>
          )}
          {item.href === "/internal" && inbox.overdue.length > 0 && (
            <span title={t("inbox.waitingCount", { n: inbox.overdue.length })} className="flex items-center gap-0.5 text-eyebrow font-semibold text-danger">
              <Clock className="h-3 w-3" />
              {inbox.overdue.length}
            </span>
          )}
        </Link>
      );
    });

  return (
    <nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1">
      <p className="pb-2 pt-[22px] font-display text-caption font-medium leading-4 text-muted">{t("nav.workspace")}</p>
      {render(CLIENT_NAV)}

      {canSeeInternal && (
        <>
          <p className="pb-2 pt-[22px] font-display text-caption font-medium leading-4 text-muted">{t("nav.tylotech")}</p>
          {render(INTERNAL_NAV)}
        </>
      )}
    </nav>
  );
}

export function DarkModeToggle() {
  const t = useT();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme-mode");
    const isDark = stored === "dark" || document.documentElement.classList.contains("dark");
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme-mode", next ? "dark" : "light"); } catch {}
  }

  return (
    <Switch size="sm" checked={dark} label={t("sidebar.darkMode")} onChange={toggle} />
  );
}

function UserProfileDropdown() {
  const t = useT();
  const router = useRouter();
  const user = useUser();
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push(currentLoginPath());
  }

  const itemClass =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body text-foreground transition-colors hover:bg-bg";
  const iconClass = "h-4 w-4 shrink-0 text-muted";
  const role = ROLE_LABEL[user.role] ?? user.role;

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Figma "Kontomenü" */}
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-[268px] overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Avatar name={user.name} src={user.avatarUrl} size={34} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-medium text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-y border-line px-4 py-2.5">
            {user.role === "admin" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/60 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
                <KeyRound className="h-3 w-3 text-brand-ink" /> {role}
              </span>
            ) : (
              <span className="text-xs font-medium text-foreground">{role}</span>
            )}
            {user.role !== "client" && <span className="text-xs text-muted">{t("account.teamLabel")}</span>}
          </div>
          <div className="p-1.5">
            <Link href="/settings" onClick={() => setOpen(false)} className={itemClass} role="menuitem">
              <Settings className={iconClass} />
              <span className="flex-1">{t("account.settings")}</span>
            </Link>
            <button type="button" role="menuitem" onClick={() => setLocale(locale === "de" ? "en" : "de")} className={itemClass}>
              <Globe className={iconClass} />
              <span className="flex-1 text-left">
                {t("account.language")} · {locale === "de" ? "Deutsch" : "English"}
              </span>
            </button>
            <div className={cn(itemClass, "cursor-default hover:bg-transparent")}>
              <Moon className={iconClass} />
              <span className="flex-1">{t("sidebar.darkMode")}</span>
              <DarkModeToggle />
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("open-command-palette"));
              }}
              className={itemClass}
            >
              <Keyboard className={iconClass} />
              <span className="flex-1 text-left">{t("account.shortcuts")}</span>
              <kbd className="rounded border border-line bg-bg px-1.5 py-px font-mono text-eyebrow text-muted">⌘K</kbd>
            </button>
            <a href="mailto:info@tylotech.de" role="menuitem" className={itemClass}>
              <LifeBuoy className={iconClass} />
              <span className="flex-1">{t("account.help")}</span>
            </a>
          </div>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body text-negative transition-colors hover:bg-negative/10"
            >
              <LogOut className="h-4 w-4" />
              <span className="flex-1 text-left">{t("account.signOut")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Figma "Konto" card */}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-[11px] border border-line py-[9px] pl-2 pr-2.5 transition-colors hover:bg-bg ring-focus"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={28} />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate font-display text-body font-medium leading-[18px] text-foreground">{user.name}</p>
          <p className="truncate text-caption leading-[15px] text-muted">{role}</p>
        </div>
        <MoreHorizontal className="h-[15px] w-[15px] shrink-0 text-muted" />
      </button>
    </div>
  );
}

export function Sidebar({
  onNavigate,
  canSeeInternal,
  userId,
  clients = [],
  navBadges = {},
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
  userId: string;
  clients?: SidebarClient[];
  navBadges?: Record<string, number>;
}) {
  const t = useT();
  return (
    <aside className="flex h-full w-[248px] flex-col border-r border-line bg-surface px-4 pb-4 pt-5">
      {/* Figma "Marke": wordmark + tools */}
      <div className="flex items-center gap-1 pb-[18px] pl-1.5">
        <Logo size={33} />
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            aria-label={t("cmd.openSearch")}
            title={t("cmd.openSearch")}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground lg:flex"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="hidden lg:block">
            <NotificationsBell userId={userId} variant="sidebar" />
          </div>
          {canSeeInternal && <BrandPreview />}
        </div>
      </div>

      {canSeeInternal && clients.length > 0 && <ClientSwitcher onNavigate={onNavigate} />}

      <NavList onNavigate={onNavigate} canSeeInternal={canSeeInternal} clients={clients} navBadges={navBadges} />

      <div className="pt-3">
        <UserProfileDropdown />
      </div>
    </aside>
  );
}
