"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Pulls fresh live data on a fixed cadence. Fires once on mount (respecting the
 * server-side staleness guard via `auto`) and then every `intervalMs`, refreshing
 * the server components afterwards so new KPIs/charts render without a manual reload.
 */
export function AutoRefresh({
  clientId,
  intervalMs = 30 * 60 * 1000, // 30 minutes
}: {
  clientId?: string | null;
  intervalMs?: number;
}) {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (running.current) return;
      running.current = true;
      try {
        const res = await fetch("/api/integrations/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto: true, ...(clientId ? { clientId } : {}) }),
        });
        if (!cancelled && res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.synced > 0) router.refresh();
        }
      } catch {
        /* offline / transient — the next tick retries */
      } finally {
        running.current = false;
      }
    }

    sync(); // on mount
    const id = setInterval(sync, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [clientId, intervalMs, router]);

  return null;
}
