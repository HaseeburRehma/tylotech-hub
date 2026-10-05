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
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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

const TYPE_COLOR: Record<string, string> = {
  message: "bg-brand/15 text-brand",
  document: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  sync: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  alert: "bg-red-500/15 text-red-500",
  user: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "relative flex items-center justify-center text-muted hover:text-foreground ring-focus",
          variant === "sidebar" ? "h-8 w-8 rounded-lg hover:bg-surface-2" : "h-10 w-10 rounded-xl border border-border",
        )}
        aria-label={t("notif.title")}
      >
        <Bell className={variant === "sidebar" ? "h-4 w-4" : "h-[18px] w-[18px]"} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground ring-2 ring-bg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "z-[60] rounded-2xl border border-border bg-surface shadow-float",
              variant === "sidebar"
                ? "fixed left-[268px] top-3 w-[360px] max-h-[calc(100vh-1.5rem)] overflow-y-auto"
                : "fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[360px]",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-base font-semibold text-foreground">{t("notif.title")}</p>
              {unread > 0 && (
                <button onClick={markAll} className="text-xs font-medium text-brand hover:underline">
                  {t("notif.markAll")}
                </button>
              )}
            </div>

            {/* Items */}
            <div className="max-h-[400px] overflow-y-auto px-2">
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
                        "relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-2",
                        !i.read && "bg-brand/[0.04]",
                      )}
                    >
                      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconColor)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{i.title}</span>
                        {i.body && <span className="mt-0.5 block text-xs text-muted line-clamp-2">{i.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted/60">{formatRelativeTime(i.created_at)}</span>
                      </span>
                      {!i.read && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-5 py-3">
              <Link
                href="/settings?tab=notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
                {t("notif.settingsLink")}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
