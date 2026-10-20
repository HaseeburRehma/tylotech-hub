"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** A partner counts as "waiting" once their oldest unanswered message is this old. */
export const WAITING_ALERT_HOURS = 3;

export interface InboxEntry {
  unread: number;
  /** Oldest client message after the team's last reply (null = answered). */
  waitingSince: string | null;
}

interface InboxValue {
  byClient: Record<string, InboxEntry>;
  totalUnread: number;
  /** Partners waiting longer than WAITING_ALERT_HOURS, longest first. */
  overdue: { clientId: string; since: string }[];
  refresh: () => void;
  /** False until chat_inbox() answered once (staff only, migration 0042). */
  loaded: boolean;
}

const EMPTY: InboxValue = { byClient: {}, totalUnread: 0, overdue: [], refresh: () => {}, loaded: false };
const InboxContext = createContext<InboxValue>(EMPTY);

export const useInbox = () => useContext(InboxContext);

/**
 * Staff inbox (migration 0042, chat_inbox()): unread client messages per
 * partner and since when each partner is waiting for a reply. Refreshes on
 * new messages and when you read a chat (Realtime), on focus and every minute.
 * Renders nothing extra for clients or before the migration exists.
 */
export function InboxProvider({ enabled, userId, children }: { enabled: boolean; userId: string; children: React.ReactNode }) {
  const [rows, setRows] = useState<{ client_id: string; unread: number; waiting_since: string | null }[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const available = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !available.current) return;
    const sb = createClient();
    if (!sb) return;
    const { data, error } = await sb.rpc("chat_inbox");
    if (error) {
      if (/chat_inbox|schema cache|does not exist/i.test(error.message)) available.current = false;
      return;
    }
    setRows((data ?? []) as typeof rows);
    setNow(Date.now());
    setLoaded(true);
  }, [enabled]);

  // Many events arrive in bursts (a client sends 3 messages) → one reload.
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 700);
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const sb = createClient();
    const channel = sb
      ?.channel(`inbox:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        if ((p.new as { client_id?: string | null }).client_id) refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const tick = setInterval(() => void load(), 60_000);
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onFocus);
      if (channel) sb?.removeChannel(channel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, userId, load, refresh]);

  const value = useMemo<InboxValue>(() => {
    const byClient: Record<string, InboxEntry> = {};
    let totalUnread = 0;
    const overdue: InboxValue["overdue"] = [];
    for (const r of rows) {
      byClient[r.client_id] = { unread: r.unread, waitingSince: r.waiting_since };
      totalUnread += r.unread;
      if (r.waiting_since && now - new Date(r.waiting_since).getTime() > WAITING_ALERT_HOURS * 3_600_000) {
        overdue.push({ clientId: r.client_id, since: r.waiting_since });
      }
    }
    overdue.sort((a, b) => a.since.localeCompare(b.since));
    return { byClient, totalUnread, overdue, refresh, loaded };
  }, [rows, now, refresh, loaded]);

  return <InboxContext.Provider value={enabled ? value : EMPTY}>{children}</InboxContext.Provider>;
}

/** "3 Std." / "2 T." since a timestamp, for waiting badges. */
export function waitedFor(since: string, locale: "de" | "en", now = Date.now()) {
  const h = Math.max(0, (now - new Date(since).getTime()) / 3_600_000);
  if (h < 1) return locale === "de" ? `${Math.max(1, Math.round(h * 60))} Min.` : `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return locale === "de" ? `${Math.floor(h)} Std.` : `${Math.floor(h)} h`;
  return locale === "de" ? `${Math.floor(h / 24)} T.` : `${Math.floor(h / 24)} d`;
}
