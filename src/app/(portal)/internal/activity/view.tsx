"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/provider";

export interface AuditRow {
  id: string;
  actor_name: string | null;
  action: string;
  client_id: string | null;
  target_type: string | null;
  target_id: string | null;
  summary: string | null;
  created_at: string;
}

const AREAS = ["client", "team", "invite", "project", "update", "document", "report", "tool", "integration"] as const;

export function ActivityView({
  rows,
  hasMore,
  clients,
  filters,
  ready,
}: {
  rows: AuditRow[];
  hasMore: boolean;
  clients: { id: string; company: string }[];
  filters: { client: string; area: string; before: string };
  ready: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const company = Object.fromEntries(clients.map((c) => [c.id, c.company]));

  const href = (next: Partial<typeof filters>) => {
    const p = new URLSearchParams();
    const merged = { ...filters, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/internal/activity${qs ? `?${qs}` : ""}`;
  };
  // Translated label for a known action, else the raw dotted verb.
  const label = (action: string) => {
    const key = `audit.a.${action}`;
    const out = t(key);
    return out === key ? action : out;
  };

  let lastDay = "";
  return (
    <div className="space-y-6">
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t("audit.filterClient")}
          value={filters.client}
          onChange={(e) => router.push(href({ client: e.target.value, before: "" }))}
          className="input-base h-9 w-auto appearance-none py-0 pr-8 text-sm"
        >
          <option value="">{t("audit.allClients")}</option>
          {[...clients].sort((a, b) => a.company.localeCompare(b.company)).map((c) => (
            <option key={c.id} value={c.id}>{c.company}</option>
          ))}
        </select>
        <select
          aria-label={t("audit.filterArea")}
          value={filters.area}
          onChange={(e) => router.push(href({ area: e.target.value, before: "" }))}
          className="input-base h-9 w-auto appearance-none py-0 pr-8 text-sm"
        >
          <option value="">{t("audit.allAreas")}</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>{t(`audit.area.${a}`)}</option>
          ))}
        </select>
        {(filters.client || filters.area || filters.before) && (
          <Link href="/internal/activity" className="inline-flex h-9 items-center px-2 text-sm text-muted hover:text-foreground">
            {t("audit.reset")}
          </Link>
        )}
      </div>

      <Card className="p-0">
        {!ready ? (
          <p className="p-6 text-sm text-muted">{t("audit.notReady")}</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <History className="h-8 w-8 text-muted/60" />
            <p className="text-sm text-muted">{t("audit.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => {
              const d = new Date(r.created_at);
              const day = d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
              const header = day !== lastDay;
              lastDay = day;
              return (
                <li key={r.id}>
                  {header && (
                    <p className="bg-surface-2/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted">{day}</p>
                  )}
                  <div className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="w-12 shrink-0 text-xs tabular-nums text-muted">
                      {d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-foreground">{r.actor_name ?? "System"}</span>{" "}
                      <span className="text-muted">{label(r.action)}</span>
                      {r.client_id && company[r.client_id] && (
                        <>
                          {" · "}
                          <Link href={href({ client: r.client_id, before: "" })} className="text-foreground hover:underline">
                            {company[r.client_id]}
                          </Link>
                        </>
                      )}
                      {r.summary && <p className="mt-0.5 break-words text-xs text-muted">{r.summary}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <Link
            href={href({ before: rows[rows.length - 1].created_at })}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            {t("audit.older")}
          </Link>
        </div>
      )}
    </div>
  );
}
