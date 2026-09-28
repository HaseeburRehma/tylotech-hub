"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { PerfArea } from "@/components/charts/perf-area";
import { PROJECT_STATUS, UPDATE_META } from "@/lib/status";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { useUser } from "@/components/providers/user-provider";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AutoRefresh } from "@/components/integrations/auto-refresh";
import { useT } from "@/lib/i18n/provider";
import type { Kpi, Project, SeriesPoint, Update } from "@/types";
import type { IntegrationHealthRow, PortfolioSummary } from "@/lib/data";

function DeltaBadge({ value, goodWhenDown = false }: { value: number; goodWhenDown?: boolean }) {
  const positive = goodWhenDown ? value < 0 : value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
      )}
    >
      {positive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {value > 0 ? "+" : ""}
      {Math.abs(value)}%
    </span>
  );
}

function KpiCardNew({
  label,
  value,
  delta,
  suffix,
  goodWhenDown,
  index,
}: {
  label: string;
  value: string;
  delta?: number;
  suffix?: string;
  goodWhenDown?: boolean;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-surface p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      </div>
      <p className="font-display text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <DeltaBadge value={delta} goodWhenDown={goodWhenDown} />
          <span className="text-xs text-muted">{suffix}</span>
        </div>
      )}
    </motion.div>
  );
}

function formatKpiValue(kpi: Kpi) {
  switch (kpi.unit) {
    case "currency":
      return formatCurrency(kpi.value);
    case "percent":
      return `${kpi.value}%`;
    case "ratio":
      return `${kpi.value.toFixed(1)}x`;
    case "rank":
      return `#${kpi.value}`;
    default:
      return new Intl.NumberFormat("en").format(kpi.value);
  }
}

export function ClientDashboardView({
  kpis,
  projects,
  updates,
  series,
}: {
  kpis: Kpi[];
  projects: Project[];
  updates: Update[];
  series: SeriesPoint[];
}) {
  const user = useUser();
  const router = useRouter();
  const t = useT();
  const firstName = user.name.split(" ")[0];
  const period =
    kpis[0]?.period ||
    new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!user.client_id) return;
    const sb = createClient();
    if (!sb) return;
    const cid = user.client_id;
    const ch = sb.channel(`dash:${cid}`);
    for (const table of ["kpis", "metric_points", "updates", "projects"]) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `client_id=eq.${cid}` },
        () => router.refresh(),
      );
    }
    ch.subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [user.client_id, router]);

  return (
    <div className="space-y-6">
      {user.role === "client" && <AutoRefresh />}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground animate-fade-up">
            {t("dash.welcome", { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("dash.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted">
            <CalendarDays className="h-4 w-4" />
            {period}
          </span>
          <Button size="sm" onClick={() => window.open("/api/reports/performance", "_blank")}>
            {t("dash.export")}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi, i) => (
            <KpiCardNew
              key={kpi.id}
              index={i}
              label={kpi.label}
              value={formatKpiValue(kpi)}
              delta={kpi.delta}
              suffix={t("dash.vsPrevMonth")}
              goodWhenDown={kpi.metric_name === "cpl"}
            />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("dash.noDataTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("dash.noDataBody")}</p>
        </Card>
      )}

      {/* Chart */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-brand" /> {t("dash.spend")}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-info" /> {t("dash.leads")}
            </span>
          </div>
        </div>
        {series.length > 0 ? (
          <PerfArea data={series} keys={["spend", "leads"]} />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted">
            {t("dash.noSeries")}
          </div>
        )}
      </Card>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Integration attention — left panel */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>{t("dash.integrationAttention")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">{t("dash.integrationAttentionDesc")}</p>
            </div>
            <Link href="/integrations" className="text-xs font-medium text-muted hover:text-foreground transition-colors">
              {t("dash.toIntegrations")} <ChevronRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="space-y-1 px-1">
            {updates.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">{t("dash.noUpdates")}</p>
            )}
            {updates.map((u, i) => {
              const meta = UPDATE_META[u.type];
              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2"
                >
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{u.title}</p>
                      <Badge variant={meta.variant} className="shrink-0">
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{u.description}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted/60">
                    {formatRelativeTime(u.created_at)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </Card>

        {/* My assigned work — right panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t("dash.myWork")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {projects.length} {t("dash.openTasks")}
              </p>
            </div>
            <Link href="/internal/projects" className="text-xs font-medium text-muted hover:text-foreground transition-colors">
              {t("dash.allProjects")} <ChevronRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="space-y-1">
            {projects.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">{t("dash.noProjects")}</p>
            )}
            {projects.map((p) => {
              const s = PROJECT_STATUS[p.status];
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      p.status === "done"
                        ? "border-success bg-success/10 text-success"
                        : "border-border",
                    )}
                  >
                    {p.status === "done" && <Check className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-sm",
                      p.status === "done" ? "text-muted line-through" : "font-medium text-foreground",
                    )}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-muted">
                      {p.assigned_to} {p.due && `· ${new Date(p.due).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                  <Badge variant={s.variant} className="shrink-0 text-[10px]">
                    {s.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─── Staff Dashboard ─── */

interface AttentionRow extends IntegrationHealthRow {
  providerLabel: string;
}

interface StaffProject extends Project {
  clientName: string;
}

interface StaffUpdate extends Update {
  clientName: string;
}

function pctDelta(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function StaffDashboardView({
  portfolio,
  attention,
  myProjects,
  myActiveTasks,
  updates,
}: {
  portfolio: PortfolioSummary;
  attention: AttentionRow[];
  myProjects: StaffProject[];
  myActiveTasks: number;
  updates: StaffUpdate[];
}) {
  const user = useUser();
  const t = useT();
  const firstName = user.name.split(" ")[0];
  const period = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground animate-fade-up">
            {t("dash.welcome", { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("dash.staff.subtitle", { period })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted">
            <CalendarDays className="h-4 w-4" />
            {period}
          </span>
          <Button size="sm" variant="primary">
            {t("dash.shareReport")}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCardNew
          index={0}
          label={t("dash.staff.spendManaged")}
          value={formatCurrency(portfolio.spend30d)}
          delta={pctDelta(portfolio.spend30d, portfolio.spendPrev30d)}
          suffix={t("dash.vsPrevMonth")}
        />
        <KpiCardNew
          index={1}
          label={t("dash.staff.leadsGenerated")}
          value={new Intl.NumberFormat("de-DE").format(portfolio.leads30d)}
          delta={pctDelta(portfolio.leads30d, portfolio.leadsPrev30d)}
          suffix={t("dash.vsPrevMonth")}
        />
        <KpiCardNew
          index={2}
          label={t("dash.staff.costPerLead")}
          value={portfolio.leads30d > 0 ? formatCurrency(portfolio.spend30d / portfolio.leads30d) : "—"}
          delta={
            portfolio.leadsPrev30d > 0 && portfolio.leads30d > 0
              ? pctDelta(
                  portfolio.spend30d / portfolio.leads30d,
                  portfolio.spendPrev30d / portfolio.leadsPrev30d,
                )
              : undefined
          }
          suffix={t("dash.vsPrevMonth")}
          goodWhenDown
        />
        <KpiCardNew
          index={3}
          label={t("dash.staff.activeClients")}
          value={String(attention.length + myProjects.length > 0 ? 10 : 0)}
          suffix={t("dash.vsPrevMonth")}
        />
      </div>

      {/* Chart */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-brand" /> {t("dash.spend")}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-info" /> {t("dash.leads")}
            </span>
          </div>
        </div>
        {portfolio.series.length > 0 ? (
          <PerfArea data={portfolio.series} keys={["spend", "leads"]} />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted">
            {t("dash.staff.noTrend")}
          </div>
        )}
      </Card>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Integration attention */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>{t("dash.integrationAttention")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">{t("dash.integrationAttentionDesc")}</p>
            </div>
            <Link href="/integrations" className="text-xs font-medium text-muted hover:text-foreground transition-colors">
              {t("dash.toIntegrations")} <ChevronRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="space-y-1">
            {attention.length === 0 && (
              <li className="flex items-center gap-2 py-6 text-center text-sm text-muted">
                <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                <span>{t("dash.staff.attentionEmpty")}</span>
              </li>
            )}
            {attention.map((row, i) => (
              <motion.div
                key={`${row.clientId}-${row.provider}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{row.clientName}</p>
                    <Badge variant="outline" className="shrink-0">
                      {row.providerLabel}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.lastSyncedAt
                      ? t("dash.staff.lastSynced", {
                          date: new Date(row.lastSyncedAt).toLocaleDateString("de-DE", {
                            day: "numeric",
                            month: "short",
                          }),
                        })
                      : t("dash.staff.neverSynced")}
                  </p>
                </div>
                <Link
                  href={`/integrations${row.clientSlug ? `?client=${row.clientSlug}` : ""}`}
                  className="shrink-0"
                >
                  <Button size="sm" variant="secondary">
                    {t("dash.staff.reconnect")}
                  </Button>
                </Link>
              </motion.div>
            ))}
          </div>
        </Card>

        {/* My assigned work */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t("dash.myWork")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {myActiveTasks} {t("dash.openTasks")}
              </p>
            </div>
            <Link href="/internal/projects" className="text-xs font-medium text-muted hover:text-foreground transition-colors">
              {t("dash.allProjects")} <ChevronRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          <div className="space-y-1">
            {myProjects.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">{t("dash.staff.noMyProjects")}</p>
            )}
            {myProjects.map((p) => {
              const s = PROJECT_STATUS[p.status];
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      p.status === "done"
                        ? "border-success bg-success/10 text-success"
                        : "border-border",
                    )}
                  >
                    {p.status === "done" && <Check className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-sm",
                      p.status === "done" ? "text-muted line-through" : "font-medium text-foreground",
                    )}>
                      {p.name}
                    </p>
                    <p className="text-[11px] text-muted">
                      {p.clientName}
                      {p.due && ` · ${new Date(p.due).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                  <Badge variant={s.variant} className="shrink-0 text-[10px]">
                    {s.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Activity feed */}
      <Card>
        <CardHeader>
          <CardTitle>{t("dash.staff.feedTitle")}</CardTitle>
          <Link href="/chat" className="text-xs font-medium text-muted hover:text-foreground transition-colors">
            {t("dash.viewAll")} <ChevronRight className="inline h-3 w-3" />
          </Link>
        </CardHeader>
        <ul className="space-y-1">
          {updates.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">{t("dash.staff.noFeed")}</li>
          )}
          {updates.map((u, i) => {
            const meta = UPDATE_META[u.type];
            return (
              <motion.li
                key={u.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2"
              >
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{u.title}</p>
                    <Badge variant="outline" className="shrink-0">
                      {u.clientName}
                    </Badge>
                    <Badge variant={meta.variant} className="shrink-0">
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">{u.description}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted/60">
                  {formatRelativeTime(u.created_at)}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
