"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useTransition } from "react";
import { useT } from "@/lib/i18n/provider";

const RefreshContext = createContext<(() => void) | null>(null);

/**
 * Reloads the page's server data after an action without blocking the screen:
 * the refresh runs in a transition (what's on screen stays usable) and a quiet
 * "Updating…" pill shows until the new data is in.
 */
export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const t = useT();
  const [pending, start] = useTransition();
  const refresh = useCallback(() => start(() => router.refresh()), [router]);
  return (
    <RefreshContext.Provider value={refresh}>
      {children}
      {pending && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-line bg-surface px-3 py-1.5 text-caption text-muted shadow-sm"
        >
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" /> {t("app.updating")}
          </span>
        </div>
      )}
    </RefreshContext.Provider>
  );
}

/** `refresh()` after a change: in the portal it shows "Updating…", elsewhere it is router.refresh(). */
export function useRefresh(): () => void {
  const ctx = useContext(RefreshContext);
  const router = useRouter();
  const plain = useCallback(() => router.refresh(), [router]);
  return ctx ?? plain;
}
