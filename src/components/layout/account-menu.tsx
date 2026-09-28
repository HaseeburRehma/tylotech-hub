"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Globe,
  HelpCircle,
  KeyRound,
  LogOut,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  admin: "Super Admin",
  team: "Team",
  client: "Client",
};

export function AccountMenu() {
  const user = useUser();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  const roleLabel = ROLE_LABEL[user.role] ?? user.role;
  const teamLabel = user.role === "client" ? user.company : t("account.teamLabel");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 z-50 mb-2 w-[240px] rounded-2xl border border-border bg-surface shadow-float"
          >
            {/* User info */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-3">
                <Avatar name={user.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="brand" className="text-[10px]">{roleLabel}</Badge>
                <span className="text-xs text-muted">{teamLabel}</span>
              </div>
            </div>

            {/* Menu items */}
            <div className="border-t border-border px-2 py-2">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-2"
              >
                <Settings className="h-4 w-4 text-muted" />
                {t("account.settings")}
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-2"
              >
                <Globe className="h-4 w-4 text-muted" />
                <span className="flex-1 text-left">{t("account.language")}</span>
                <span className="text-xs text-muted">Deutsch</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-2"
              >
                <KeyRound className="h-4 w-4 text-muted" />
                <span className="flex-1 text-left">{t("account.shortcuts")}</span>
                <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-muted">⌘/</kbd>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-2"
              >
                <HelpCircle className="h-4 w-4 text-muted" />
                {t("account.help")}
              </button>
            </div>

            {/* Sign out */}
            <div className="border-t border-border px-2 py-2">
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger transition-colors hover:bg-danger/10"
              >
                <LogOut className="h-4 w-4" />
                {t("account.signOut")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
