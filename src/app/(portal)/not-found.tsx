"use client";

import {
  ArrowRight,
  FolderKanban,
  LayoutDashboard,
  LineChart,
  Mail,
  MessageCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";

function StyledHeadline({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <span key={i} className="font-serif text-[1.08em] font-normal italic tracking-normal text-brand-ink">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

// Clients can't open staff pages — they get the Figma set (Dashboard, Performance, Chat).
const CLIENT_LINKS = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.dashboard", descKey: "e404.dashboardDesc" },
  { href: "/performance", icon: LineChart, labelKey: "nav.performance", descKey: "e404.perfDesc" },
  { href: "/chat", icon: MessageCircle, labelKey: "nav.chat", descKey: "e404.chatDesc" },
] as const;

const STAFF_LINKS = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "nav.dashboard",
    descKey: "e404.dashboardDesc",
  },
  {
    href: "/internal/clients",
    icon: Users,
    labelKey: "nav.clients",
    descKey: "e404.clientsDesc",
  },
  {
    href: "/internal/projects",
    icon: FolderKanban,
    labelKey: "nav.projects",
    descKey: "e404.projectsDesc",
  },
] as const;

export default function NotFound() {
  const t = useT();
  const user = useUser();
  const links = user.role === "client" ? CLIENT_LINKS : STAFF_LINKS;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs font-medium tracking-[0.12em] text-muted">{t("e404.label")}</p>

      <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
        <StyledHeadline text={t("e404.headline")} />
      </h1>

      <p className="mt-3 max-w-md text-[14px] text-soft">
        {t("e404.body")}
      </p>

      {/* Nav cards */}
      <div className="card mt-8 w-full max-w-lg divide-y divide-line overflow-hidden">
        {links.map(({ href, icon: Icon, labelKey, descKey }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-bg"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg">
              <Icon className="h-4 w-4 text-muted" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-display text-sm font-medium">{t(labelKey)}</p>
              <p className="text-xs text-muted">{t(descKey)}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted" />
          </Link>
        ))}
      </div>

      {/* CTAs */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/dashboard">{t("e404.toDashboard")}</ButtonLink>
        <ButtonLink href="mailto:info@tylotech.de" variant="outline">
            <Mail className="h-4 w-4" />
            {t("e404.support")}
          </ButtonLink>
      </div>
    </div>
  );
}
