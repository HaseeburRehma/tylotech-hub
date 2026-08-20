"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Live list of the current user's UNREAD notification hrefs. The sidebar buckets
 * these by nav item (longest-prefix match) to show real unread badges instead of
 * a hardcoded number. Subscribes to all notification changes for this user so the
 * badge grows on new messages and shrinks as they're marked read.
 */
export function useUnreadHrefs(userId: string) {
  const [hrefs, setHrefs] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json().catch(() => null);
    const items = (data?.items ?? []) as { href: string | null; read: boolean }[];
    setHrefs(items.filter((i) => !i.read && i.href).map((i) => i.href as string));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`nav-unread:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return { hrefs, reload: load };
}
