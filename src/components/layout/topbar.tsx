"use client";

import { Menu } from "lucide-react";
import { SearchBox } from "@/components/layout/search-box";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AuthUser } from "@/lib/auth";
import { useT } from "@/lib/i18n/provider";

export function Topbar({ onMenu, user }: { onMenu: () => void; user: AuthUser }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-xl md:px-6 lg:hidden">
      <button
        type="button"
        onClick={onMenu}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted hover:text-foreground ring-focus"
        aria-label={t("nav.openMenu")}
      >
        <Menu className="h-5 w-5" />
      </button>

      <SearchBox />

      <div className="ml-auto flex items-center gap-1.5">
        <LanguageSwitcher />
        {(!isSupabaseConfigured || user.role !== "client") && <ThemeSwitcher />}
        <NotificationsBell userId={user.id} />
      </div>
    </header>
  );
}
