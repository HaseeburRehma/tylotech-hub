"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLIENT_NAV, INTERNAL_NAV } from "@/lib/nav";
import { Logo } from "@/components/ui/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

function NavList({
  onNavigate,
  canSeeInternal,
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
}) {
  const pathname = usePathname();
  const t = useT();

  // Longest-prefix match so /internal/projects highlights "Projects", not "Internal Hub".
  const allHrefs = [...CLIENT_NAV, ...INTERNAL_NAV].map((i) => i.href);
  const activeHref = allHrefs
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const render = (items: typeof CLIENT_NAV) =>
    items.map((item) => {
      const active = item.href === activeHref;
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ring-focus",
            active ? "text-foreground" : "text-muted hover:text-foreground hover:bg-surface-2",
          )}
        >
          {active && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-10 rounded-xl bg-brand/10 ring-1 ring-brand/20"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className={cn("h-[18px] w-[18px]", active && "text-brand")} />
          <span className="flex-1 font-medium">{t(item.label)}</span>
          {item.badge && (
            <Badge variant="brand" className="px-1.5 py-0.5 text-[10px]">
              {item.badge}
            </Badge>
          )}
        </Link>
      );
    });

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      <p className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
        {t("nav.workspace")}
      </p>
      {render(CLIENT_NAV)}
      {canSeeInternal && (
        <>
          <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
            {t("nav.tylotech")}
          </p>
          {render(INTERNAL_NAV)}
        </>
      )}
    </nav>
  );
}

export function Sidebar({
  onNavigate,
  canSeeInternal,
}: {
  onNavigate?: () => void;
  canSeeInternal: boolean;
}) {
  const t = useT();
  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-border bg-surface/40">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>

      <NavList onNavigate={onNavigate} canSeeInternal={canSeeInternal} />

      <div className="m-3 mt-auto rounded-2xl border border-brand/20 bg-brand/[0.06] p-4">
        <div className="mb-1.5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold text-foreground">{t("nav.unlockAi")}</span>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted">{t("nav.unlockAiDesc")}</p>
        <Link
          href="/ai-tools"
          onClick={onNavigate}
          className="inline-flex text-xs font-semibold text-brand hover:underline"
        >
          {t("nav.viewAddons")}
        </Link>
      </div>
    </aside>
  );
}
