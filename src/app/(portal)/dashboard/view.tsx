"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Download,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { PerfArea } from "@/components/charts/perf-area";
import { MiniSpark } from "@/components/charts/mini-spark";
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

  // Live dashboard — refresh when the agency updates this client's data.
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
      <PageHeader
        title={t("dash.welcome", { name: firstName })}
        subtitle={t("dash.subtitle")}
      >
        <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted">
          <CalendarDays className="h-4 w-4" />
          {kpis[0]?.period || new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}
        </span>
        <Button size="sm" onClick={() => window.open("/api/reports/performance", "_blank")}>
          <Download className="h-4 w-4" />
          {t("dash.export")}
        </Button>
      </PageHeader>

      {kpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi, i) => (
            <KpiCard key={kpi.id} kpi={kpi} index={i} spark={series} />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-foreground">{t("dash.noDataTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("dash.noDataBody")}</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("dash.adSpendLeads")}</CardTitle>
            <p className="mt-0.5 text-xs text-muted">{t("dash.last30days")}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-brand" /> {t("dash.spend")}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-info" /> {t("dash.leads")}
            </span>
          </div>
        </CardHeader>
        {series.length > 0 ? (
          <PerfArea data={series} keys={["spend", "leads"]} />
        ) : (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted">
            {t("dash.noSeries")}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dash.recentUpdates")}</CardTitle>
            <Link href="/chat" className="text-xs font-medium text-brand hover:underline">
              {t("dash.viewAll")}
            </Link>
          </CardHeader>
          <ul className="space-y-1">
            {updates.length === 0 && (
              <li className="py-6 text-center text-sm text-muted">{t("dash.noUpdates")}</li>
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
                </motion.li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dash.activeProjects")}</CardTitle>
            <Badge variant="brand">{projects.length}</Badge>
          </CardHeader>
          <div className="space-y-4">
            {projects.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">{t("dash.noProjects")}</p>
            )}
            {projects.map((p) => {
              const s = PROJECT_STATUS[p.status];
              return (
                <div key={p.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <Progress value={p.progress} tone={s.tone} />
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                    <span>{p.assigned_to}</span>
                    <span>{p.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <AiToolsCta />
    </div>
  );
}

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

function DeltaBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold",
        positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
      )}
    >
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5 rotate-90" />}
      {Math.abs(value)}%
    </span>
  );
}

function StatCard({
  label,
  value,
  delta,
  spark,
  sparkKey,
  index,
}: {
  label: string;
  value: string;
  delta?: number;
  spark?: SeriesPoint[];
  sparkKey?: "spend" | "leads";
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="card card-hover group relative overflow-hidden p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        {delta !== undefined && <DeltaBadge value={delta} />}
      </div>
      {spark && sparkKey && (
        <div className="mt-3 -mx-1">
          <MiniSpark data={spark} dataKey={sparkKey} />
        </div>
      )}
    </motion.div>
  );
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
  const period = new Date().toLocaleDateString("en", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dash.welcome", { name: firstName })}
        subtitle={t("dash.staff.subtitle", { period })}
      >
        <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted">
          <CalendarDays className="h-4 w-4" />
          {period}
        </span>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label={t("dash.staff.spendManaged")}
          value={formatCurrency(portfolio.spend30d)}
          delta={pctDelta(portfolio.spend30d, portfolio.spendPrev30d)}
          spark={portfolio.series}
          sparkKey="spend"
        />
        <StatCard
          index={1}
          label={t("dash.staff.leadsGenerated")}
          value={new Intl.NumberFormat("en").format(portfolio.leads30d)}
          delta={pctDelta(portfolio.leads30d, portfolio.leadsPrev30d)}
          spark={portfolio.series}
          sparkKey="leads"
        />
        <StatCard
          index={2}
          label={t("dash.staff.needsAttention")}
          value={String(attention.length)}
        />
        <StatCard
          index={3}
          label={t("dash.staff.myActiveTasks")}
          value={String(myActiveTasks)}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("dash.staff.trendTitle")}</CardTitle>
            <p className="mt-0.5 text-xs text-muted">{t("dash.staff.last30days")}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-brand" /> {t("dash.spend")}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full bg-info" /> {t("dash.leads")}
            </span>
          </div>
        </CardHeader>
        {portfolio.series.length > 0 ? (
          <PerfArea data={portfolio.series} keys={["spend", "leads"]} />
        ) : (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted">
            {t("dash.staff.noTrend")}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dash.staff.attentionTitle")}</CardTitle>
            <Badge variant={attention.length > 0 ? "warning" : "success"}>{attention.length}</Badge>
          </CardHeader>
          <ul className="space-y-1">
            {attention.length === 0 && (
              <li className="flex items-center gap-2 py-6 text-center text-sm text-muted">
                <CheckCircle2 className="mx-auto h-4 w-4 text-success" />
                <span className="mx-auto">{t("dash.staff.attentionEmpty")}</span>
              </li>
            )}
            {attention.map((row, i) => (
              <motion.li
                key={`${row.clientId}-${row.provider}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15">
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
                          date: new Date(row.lastSyncedAt).toLocaleDateString("en", {
                            day: "numeric",
                            month: "short",
                          }),
                        })
                      : t("dash.staff.neverSynced")}
                  </p>
                </div>
                <Link
                  href={`/integrations${row.clientSlug ? `?client=${row.clientSlug}` : ""}`}
                  className="shrink-0 text-xs font-medium text-brand hover:underline"
                >
                  {t("dash.staff.reconnect")}
                </Link>
              </motion.li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dash.staff.myProjectsTitle")}</CardTitle>
            <Badge variant="brand">{myProjects.length}</Badge>
          </CardHeader>
          <div className="space-y-4">
            {myProjects.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">{t("dash.staff.noMyProjects")}</p>
            )}
            {myProjects.map((p) => {
              const s = PROJECT_STATUS[p.status];
              return (
                <div key={p.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <Progress value={p.progress} tone={s.tone} />
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                    <span>{p.clientName}</span>
                    <span>{p.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dash.staff.feedTitle")}</CardTitle>
          <Link href="/chat" className="text-xs font-medium text-brand hover:underline">
            {t("dash.viewAll")}
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

      <AiToolsCta />
    </div>
  );
}

function AiToolsCta() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-brand/25 bg-brand/[0.06] p-6"
    >
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15">
            <Sparkles className="h-5 w-5 text-brand" />
          </span>
          <div>
            <h3 className="text-base font-semibold">{t("dash.aiCtaTitle")}</h3>
            <p className="mt-0.5 text-sm text-muted">{t("dash.aiCtaBody")}</p>
          </div>
        </div>
        <Link href="/ai-tools/content-generator">
          <Button>
            {t("dash.openTool")}
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
