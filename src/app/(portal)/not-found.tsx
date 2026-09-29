"use client";

import {
  ArrowRight,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

function StyledHeadline({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") ? (
          <span
            key={i}
            className="italic"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const NAV_LINKS = [
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

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted">
        {t("e404.label")}
      </p>

      <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
        <StyledHeadline text={t("e404.headline")} />
      </h1>

      <p className="mt-4 max-w-md text-sm text-muted">
        {t("e404.body")}
      </p>

      {/* Nav cards */}
      <div className="mt-8 w-full max-w-lg divide-y divide-border rounded-2xl border border-border bg-bg">
        {NAV_LINKS.map(({ href, icon: Icon, labelKey, descKey }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface first:rounded-t-2xl last:rounded-b-2xl"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface">
              <Icon className="h-5 w-5 text-muted" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">{t(labelKey)}</p>
              <p className="text-xs text-muted">{t(descKey)}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted" />
          </Link>
        ))}
      </div>

      {/* CTAs */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/dashboard">
          <Button>{t("e404.toDashboard")}</Button>
        </Link>
        <Link href="mailto:support@tylotech.de">
          <Button variant="outline">
            <Mail className="mr-1.5 h-4 w-4" />
            {t("e404.support")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
