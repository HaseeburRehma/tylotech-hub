"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CheckCheck,
  FileText,
  MessageCircle,
  RefreshCw,
  AlertCircle,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

interface Item {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
  type?: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  message: MessageCircle,
  document: FileText,
  sync: RefreshCw,
  alert: AlertCircle,
  user: UserPlus,
};

// Figma notification tiles: gold for people/messages, neutral for files,
// teal for syncs, rust for alerts.
const TYPE_COLOR: Record<string, string> = {
  message: "bg-brand/15 text-brand-ink",
  document: "bg-line text-soft",
  sync: "bg-positive/10 text-positive",
  alert: "bg-negative/10 text-negative",
  user: "bg-brand/15 text-brand-ink",
};

function guessType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("nachricht") || t.includes("message")) return "message";
  if (t.includes("datei") || t.includes("file") || t.includes("dokument") || t.includes("document")) return "document";
  if (t.includes("synchron") || t.includes("sync") || t.includes("console")) return "sync";
  if (t.includes("budget") || t.includes("ausgeschöpft") || t.includes("alert") || t.includes("warnung")) return "alert";
  if (t.includes("angelegt") || t.includes("created") || t.includes("eingeladen") || t.includes("invited")) return "user";
  return "message";
}

export function NotificationsBell({ userId, variant = "topbar" }: { userId: string; variant?: "topbar" | "sidebar" }) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const instanceId = useId();

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
    setUnread(data.unread ?? 0);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      // Unique per mounted bell — the topbar and sidebar can both be mounted, and
      // Supabase rejects adding listeners to an already-subscribed channel name.
      .channel(`notifications:${userId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load, instanceId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    setUnread(0);
    setItems((it) => it.map((i) => ({ ...i, read: true })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
  }

  function openItem(i: Item) {
    setOpen(false);
    if (!i.read) {
      setUnread((n) => Math.max(0, n - 1));
      setItems((it) => it.map((x) => (x.id === i.id ? { ...x, read: true } : x)));
    }
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id }) }).catch(() => null);
    if (i.href) router.push(i.href);
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className={cn(
            "z-[60] overflow-hidden rounded-2xl border border-line bg-surface shadow-float",
            variant === "sidebar"
              ? "fixed left-[268px] top-11 flex max-h-[calc(100dvh-3.5rem)] w-[392px] flex-col"
              : "fixed inset-x-4 top-16 flex max-h-[calc(100dvh-5rem)] flex-col sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[392px]",
          )}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-line px-[18px] py-3.5">
            <p className="font-display text-[15px] font-semibold text-foreground">{t("notif.title")}</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-[13px] font-medium text-brand-ink hover:underline">
                {t("notif.markAll")}
              </button>
            )}
          </div>

          {/* Items */}
          <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted">{t("notif.caughtUp")}</p>
            ) : (
              items.map((i) => {
                const nType = i.type || guessType(i.title);
                const Icon = TYPE_ICON[nType] ?? Bell;
                const iconColor = TYPE_COLOR[nType] ?? "bg-surface-2 text-muted";
                return (
                  <button
                    key={i.id}
                    onClick={() => openItem(i)}
                    className={cn(
                      "relative flex w-full items-start gap-3 px-[18px] py-3.5 text-left transition-colors hover:bg-bg",
                      !i.read && "bg-brand/[0.07] hover:bg-brand/10",
                    )}
                  >
                    <span className={cn("mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg", iconColor)}>
                      <Icon className="h-[15px] w-[15px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[13.5px] font-medium text-foreground">{i.title}</span>
                      {i.body && <span className="mt-0.5 block text-[12.5px] leading-[18px] text-soft line-clamp-2">{i.body}</span>}
                      <span className="mt-1 block font-mono text-[10.5px] text-muted">{formatRelativeTime(i.created_at)}</span>
                    </span>
                    {!i.read && (
                      <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-brand" aria-label="unread" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-line bg-bg px-5 py-3">
            <Link
              href="/settings?tab=notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-[13px] text-soft transition-colors hover:text-foreground"
            >
              {t("notif.settingsLink")}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "relative flex items-center justify-center text-muted hover:text-foreground ring-focus",
          variant === "sidebar" ? "h-[30px] w-[30px] rounded-lg hover:bg-bg" : "h-10 w-10 rounded-xl border border-border",
        )}
        aria-label={unread > 0 ? `${t("notif.title")} (${unread})` : t("notif.title")}
      >
        <Bell className={variant === "sidebar" ? "h-[17px] w-[17px]" : "h-[18px] w-[18px]"} strokeWidth={1.75} />
        {/* Figma: a small rust dot on the bell; the count shows in the panel and for screen readers. */}
        {unread > 0 &&
          (variant === "sidebar" ? (
            <span className="absolute right-[3px] top-[4px] h-[7px] w-[7px] rounded-full bg-negative ring-2 ring-surface" />
          ) : (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground ring-2 ring-bg">
              {unread > 9 ? "9+" : unread}
            </span>
          ))}
      </button>

      {/* The sidebar sits in a sticky (own stacking context) column, so its panel
          is portalled to <body>; otherwise the page content paints over it. */}
      {variant === "sidebar" ? mounted && createPortal(panel, document.body) : panel}
    </div>
  );
}
