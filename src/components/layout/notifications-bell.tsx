"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Item {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

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

  // Live badge updates.
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

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
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id }) });
    if (i.href) router.push(i.href);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground ring-focus"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
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
            className="glass absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-border p-2 shadow-float"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              {unread > 0 && (
                <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>
              ) : (
                items.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => openItem(i)}
                    className={cn(
                      "flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                      !i.read && "bg-brand/[0.06]",
                    )}
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.read ? "bg-transparent" : "bg-brand")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{i.title}</span>
                      {i.body && <span className="block truncate text-xs text-muted">{i.body}</span>}
                      <span className="block text-[10px] text-muted/60">{formatRelativeTime(i.created_at)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
