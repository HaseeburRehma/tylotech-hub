"use client";

import { LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { SearchBox } from "@/components/layout/search-box";
import { Avatar } from "@/components/ui/avatar";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AuthUser } from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  admin: "Super Admin",
  team: "TyloTech Team",
  client: "Client",
};

export function Topbar({ onMenu, user }: { onMenu: () => void; user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/70 px-4 backdrop-blur-xl md:px-6">
      <button
        onClick={onMenu}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground lg:hidden ring-focus"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <SearchBox />

      <div className="ml-auto flex items-center gap-2">
        {/* White-label switcher is staff-only — a client must never see other brands. */}
        {(!isSupabaseConfigured || user.role !== "client") && <ThemeSwitcher />}
        <NotificationsBell userId={user.id} />

        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 py-1 pl-1 pr-3 ring-focus"
          >
            <Avatar name={user.name} size={30} />
            <div className="hidden leading-tight text-left sm:block">
              <p className="text-xs font-semibold text-foreground">{user.name}</p>
              <p className="text-[11px] text-muted">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="glass absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-border p-2 shadow-float"
              >
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
