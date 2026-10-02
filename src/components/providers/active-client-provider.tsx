"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { writeActiveClientCookie } from "@/lib/active-client";
import type { SidebarClient } from "@/components/layout/app-shell";

// Pages whose server component reads ?client= — switching re-navigates them.
const URL_SCOPED_PATHS = ["/performance", "/integrations"];

interface ActiveClientValue {
  clients: SidebarClient[];
  active: SidebarClient | null;
  setActive: (client: SidebarClient) => void;
}

const ActiveClientContext = createContext<ActiveClientValue>({
  clients: [],
  active: null,
  setActive: () => {},
});

const refOf = (c: SidebarClient) => c.slug ?? c.id;
const matches = (c: SidebarClient, ref: string) => c.id === ref || c.slug === ref;

export function ActiveClientProvider({
  clients,
  initialActiveId,
  children,
}: {
  clients: SidebarClient[];
  initialActiveId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlRef = searchParams.get("client");

  const [activeId, setActiveId] = useState<string | null>(initialActiveId);

  // In-page client chips navigate with ?client= — keep the sidebar and cookie in sync.
  useEffect(() => {
    if (!urlRef) return;
    const c = clients.find((x) => matches(x, urlRef));
    if (!c) return;
    setActiveId(c.id);
    writeActiveClientCookie(refOf(c));
  }, [urlRef, clients]);

  const setActive = useCallback(
    (client: SidebarClient) => {
      setActiveId(client.id);
      writeActiveClientCookie(refOf(client));
      if (URL_SCOPED_PATHS.some((p) => pathname === p)) {
        router.push(`${pathname}?client=${encodeURIComponent(refOf(client))}`);
      } else {
        router.refresh();
      }
    },
    [pathname, router],
  );

  const value = useMemo<ActiveClientValue>(
    () => ({
      clients,
      active: clients.find((c) => c.id === activeId) ?? clients[0] ?? null,
      setActive,
    }),
    [clients, activeId, setActive],
  );

  return <ActiveClientContext.Provider value={value}>{children}</ActiveClientContext.Provider>;
}

export function useActiveClient() {
  return useContext(ActiveClientContext);
}
