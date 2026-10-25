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
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, Panel, PanelHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PendingApprovalsBanner } from "@/components/approvals/approvals-list";
import { PerfArea } from "@/components/charts/perf-area";
import { PROJECT_STATUS, UPDATE_META } from "@/lib/status";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { useUser } from "@/components/providers/user-provider";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AutoRefresh } from "@/components/integrations/auto-refresh";
import { useT } from "@/lib/i18n/provider";
import { LOWER_IS_BETTER, shownDelta } from "@/lib/status";
import { useActiveClient } from "@/components/providers/active-client-provider";
import type { Kpi, Project, SeriesPoint, Update } from "@/types";
import type { IntegrationHealthRow, PortfolioSummary } from "@/lib/data";
import { APP_TZ } from "@/lib/utils";

function DeltaBadge({ value, goodWhenDown = false }: { value: number; goodWhenDown?: boolean }) {
  const good = goodWhenDown ? value <= 0 : value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md py-0.5 pl-1.5 pr-2 font-mono text-[11px] font-medium leading-[14px]",
        good ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
      )}
    >
      {value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value)}%
    </span>
  );
}

/** One cell of the Figma KPI strip (sits in a hairline grid on top of the chart). */
function KpiCell({
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="min-w-0 bg-surface px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
        <p className="eyebrow truncate">{label}</p>
      </div>
      <p className="mt-2 truncate font-display text-[22px] font-semibold leading-8 tracking-[-0.03em] text-foreground sm:text-[28px]">
        {value}
      </p>
      {delta !== undefined && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <DeltaBadge value={delta} goodWhenDown={goodWhenDown} />
          <span className="text-[11.5px] text-muted">{suffix}</span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Hairline grid: 2 cells per row on phones, 4 from lg. Each cell draws its own
 * right/bottom rule and the grid is pulled 1px under the edges, so any count
 * wraps cleanly and leftover slots stay blank.
 */
function KpiStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden border-b border-line">
      <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-line">{children}</div>
    </div>
  );
}

/** Figma page header: title + subtitle left, period pill and primary action right. */
function DashHeader({ title, subtitle, period, action }: { title: string; subtitle: string; period: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-foreground animate-fade-up md:text-2xl">{title}</h1>
        <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-soft shadow-card sm:flex-none">
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{period}</span>
        </span>
        {action}
      </div>
    </div>
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

// Headline numbers first: money and leads, then traffic, then SEO detail
// (same order as the mobile app); unknown metrics keep their order at the end.
const KPI_ORDER = [
  "ad_spend", "spend", "leads", "cpl", "roas", "revenue",
  "sessions", "users", "conversion_rate",
  "organic_clicks", "clicks", "impressions", "avg_position", "ctr",
  "ai_referral_sessions", "ai_referral_share",
];
const kpiRank = (name: string) => {
  const i = KPI_ORDER.indexOf(name);
  return i === -1 ? KPI_ORDER.length : i;
};

export function ClientDashboardView({
  kpis,
  projects,
  updates,
  series,
  seriesKind = "ads",
  connectedSources,
  totalSources,
}: {
  kpis: Kpi[];
  projects: Project[];
  updates: Update[];
  series: SeriesPoint[];
  /** What the chart shows: ad spend/leads, or GA4 / Search Console when there are no ads. */
  seriesKind?: "ads" | "ga4" | "seo";
  connectedSources: number;
  totalSources: number;
}) {
  const user = useUser();
  const router = useRouter();
  const t = useT();
  const firstName = user.name.split(" ")[0];
  // GA4 rows carry sessions in "roas" and users in "leads"; Search Console
  // carries clicks in "leads" (same mapping as the Leistung page).
  const chartKeys: ("spend" | "leads" | "roas")[] =
    seriesKind === "ga4" ? ["roas", "leads"] : seriesKind === "seo" ? ["leads"] : ["spend", "leads"];
  const chartLabels: Partial<Record<"spend" | "leads" | "roas", string>> =
    seriesKind === "ga4"
      ? { roas: t("perf.metricSessions"), leads: t("perf.metricDailyUsers") }
      : seriesKind === "seo"
        ? { leads: t("perf.metricClicks") }
        : { spend: t("dash.spend"), leads: t("dash.leads") };
  const period =
    kpis[0]?.period ||
    new Date().toLocaleDateString("de-DE", { timeZone: APP_TZ, month: "long", year: "numeric" });

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
    <div className="space-y-4 sm:space-y-5">
      {user.role === "client" && <AutoRefresh />}

      <DashHeader
        title={t("dash.welcome", { name: firstName })}
        subtitle={t("dash.subtitle")}
        period={period}
        action={
          <Button size="sm" onClick={() => window.open("/api/reports/performance", "_blank", "noopener")}>
            {t("dash.export")}
          </Button>
        }
      />

      <PendingApprovalsBanner />

      {/* KPI strip + trend chart in one panel (Figma) */}
      <Panel>
        {kpis.length > 0 ? (
          <KpiStrip>
            {[...kpis].sort((a, b) => kpiRank(a.metric_name) - kpiRank(b.metric_name)).map((kpi, i) => (
              <KpiCell
                key={kpi.id}
                index={i}
                label={kpi.label}
                value={formatKpiValue(kpi)}
                delta={shownDelta(kpi.delta)}
                suffix={t("dash.vsPrevMonth")}
                goodWhenDown={LOWER_IS_BETTER.has(kpi.metric_name)}
              />
            ))}
          </KpiStrip>
        ) : (
          <div className="flex flex-col items-center justify-center border-b border-line px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{t("dash.noDataTitle")}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{t("dash.noDataBody")}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {chartKeys.map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-soft">
                <span className={cn("h-0.5 w-3.5 rounded-full", k === "spend" ? "bg-brand" : k === "leads" ? "bg-positive" : "bg-success")} />
                {chartLabels[k]}
              </span>
            ))}
          </div>
          {seriesKind !== "ads" && <span className="text-[11px] text-muted">{t(seriesKind === "ga4" ? "dash.chartGa4" : "dash.chartSeo")}</span>}
        </div>
        {series.length > 0 ? (
          <PerfArea data={series} keys={chartKeys} labels={chartLabels} />
        ) : (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-muted">
            {t("dash.noSeries")}
          </div>
        )}
      </Panel>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="min-w-0">
          <PanelHeader
            title={t("dash.updatesTitle")}
            subtitle={
              <span className={connectedSources < totalSources ? "text-warning" : undefined}>
                {t("dash.sourcesConnected", { n: connectedSources, total: totalSources })}
              </span>
            }
            action={
              <Link href="/integrations" className="inline-flex items-center gap-0.5 hover:text-foreground">
                <span className="hidden sm:inline">{t("dash.toIntegrations")}</span> <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {updates.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("dash.noUpdates")}</p>}
          <ul className="divide-y divide-line">
            {updates.map((u, i) => {
              const meta = UPDATE_META[u.type];
              return (
                <motion.li
                  key={u.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex gap-3 px-5 py-3.5"
                >
                  <span className="w-0.5 shrink-0 self-stretch rounded-full bg-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="eyebrow">{t(meta.label)}</p>
                      <span className="ml-auto text-[11px] text-muted">{formatRelativeTime(u.created_at)}</span>
                    </div>
                    <p className="mt-1 font-display text-sm font-medium text-foreground">{u.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-soft">{u.description}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title={t("dash.myWork")}
            subtitle={`${projects.length} ${t("dash.openTasks")}`}
            action={
              <Link href="/projects" className="inline-flex items-center gap-0.5 hover:text-foreground">
                <span className="hidden sm:inline">{t("dash.allProjects")}</span> <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {projects.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("dash.noProjects")}</p>}
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <TaskRow
                key={p.id}
                done={p.status === "done"}
                name={p.name}
                meta={p.assigned_to ?? ""}
                due={p.due}
                status={p.status}
              />
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** Figma "My assigned work" row: checkbox, title + meta, date / status on the right. */
function TaskRow({ done, name, meta, due, status }: { done: boolean; name: string; meta: string; due?: string | null; status: Project["status"] }) {
  const t = useT();
  const s = PROJECT_STATUS[status];
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border",
          done ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface",
        )}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-display text-[13.5px]", done ? "text-muted line-through" : "font-medium text-foreground")}>{name}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          {meta && <span className="truncate text-[11.5px] text-muted">{meta}</span>}
          {status === "blocked" && (
            <span className="shrink-0 rounded bg-negative/10 px-1.5 font-mono text-[10px] text-negative">{t(s.label)}</span>
          )}
        </div>
      </div>
      <span className="shrink-0 text-right text-[11.5px] text-muted">
        {due
          ? new Date(due).toLocaleDateString("de-DE", { timeZone: APP_TZ, weekday: "short", day: "numeric", month: "short" })
          : t(s.label)}
      </span>
    </li>
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


export function StaffDashboardView({
  portfolio,
  attention,
  myProjects,
  myActiveTasks,
  updates,
  activeClients,
}: {
  portfolio: PortfolioSummary;
  attention: AttentionRow[];
  myProjects: StaffProject[];
  myActiveTasks: number;
  updates: StaffUpdate[];
  activeClients: number;
}) {
  const user = useUser();
  const t = useT();
  const { active: activeClient } = useActiveClient();
  const firstName = user.name.split(" ")[0];
  const period = new Date().toLocaleDateString("de-DE", { timeZone: APP_TZ, month: "long", year: "numeric" });

  return (
    <div className="space-y-4 sm:space-y-5">
      <DashHeader
        title={t("dash.welcome", { name: firstName })}
        subtitle={t("dash.staff.subtitle", { period })}
        period={period}
        action={
          <Button
            size="sm"
            disabled={!activeClient}
            title={activeClient ? activeClient.name : undefined}
            onClick={() =>
              activeClient && window.open(`/api/reports/performance?client=${activeClient.id}`, "_blank", "noopener")
            }
          >
            {t("dash.shareReport")}
          </Button>
        }
      />

      {/* Portfolio KPIs + trend (Figma: one panel) */}
      <Panel>
        <KpiStrip>
          <KpiCell
            index={0}
            label={t("dash.staff.spendManaged")}
            value={formatCurrency(portfolio.spend30d)}
            delta={shownDelta(portfolio.spendDelta)}
            suffix={t("dash.vsPrevMonth")}
          />
          <KpiCell
            index={1}
            label={t("dash.staff.leadsGenerated")}
            value={new Intl.NumberFormat("de-DE").format(portfolio.leads30d)}
            delta={shownDelta(portfolio.leadsDelta)}
            suffix={t("dash.vsPrevMonth")}
          />
          <KpiCell
            index={2}
            label={t("dash.staff.costPerLead")}
            value={portfolio.leads30d > 0 ? formatCurrency(portfolio.spend30d / portfolio.leads30d) : "—"}
            delta={shownDelta(portfolio.cplDelta)}
            suffix={t("dash.vsPrevMonth")}
            goodWhenDown
          />
          <KpiCell index={3} label={t("dash.staff.activeClients")} value={String(activeClients)} />
        </KpiStrip>
        <div className="flex items-center gap-4 px-4 pt-4 text-xs sm:px-6">
          <span className="flex items-center gap-1.5 text-soft">
            <span className="h-0.5 w-3.5 rounded-full bg-brand" /> {t("dash.spend")}
          </span>
          <span className="flex items-center gap-1.5 text-soft">
            <span className="h-0.5 w-3.5 rounded-full bg-positive" /> {t("dash.leads")}
          </span>
        </div>
        {portfolio.series.length > 0 ? (
          <PerfArea data={portfolio.series} keys={["spend", "leads"]} />
        ) : (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-muted">{t("dash.staff.noTrend")}</div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Integrations needing attention */}
        <Panel className="min-w-0">
          <PanelHeader
            title={t("dash.integrationAttention")}
            subtitle={t("dash.staff.attentionCount", { n: attention.length })}
            action={
              <Link href="/integrations" className="inline-flex items-center gap-0.5 hover:text-foreground">
                <span className="hidden sm:inline">{t("dash.toIntegrations")}</span> <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {attention.length === 0 && (
            <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-muted">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>{t("dash.staff.attentionEmpty")}</span>
            </div>
          )}
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {attention.map((row, i) => (
              <motion.li
                key={`${row.clientId}-${row.provider}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.04 }}
                className="flex items-start gap-3 px-5 py-3.5"
              >
                <span className="w-0.5 shrink-0 self-stretch rounded-full bg-negative" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.07em] text-negative">{row.providerLabel}</p>
                  <p className="mt-1 truncate font-display text-sm font-medium text-foreground">{row.clientName}</p>
                  <p className="mt-0.5 text-[12.5px] text-soft">
                    {row.lastSyncedAt
                      ? t("dash.staff.lastSynced", {
                          date: new Date(row.lastSyncedAt).toLocaleDateString("de-DE", { timeZone: APP_TZ, day: "numeric", month: "short" }),
                        })
                      : t("dash.staff.neverSynced")}
                  </p>
                </div>
                <ButtonLink href={`/integrations${row.clientSlug ? `?client=${row.clientSlug}` : ""}`} size="sm" variant="secondary" className="h-8 shrink-0">
                    {t("dash.staff.reconnect")}
                  </ButtonLink>
              </motion.li>
            ))}
          </ul>
        </Panel>

        {/* My assigned work */}
        <Panel className="min-w-0">
          <PanelHeader
            title={t("dash.myWork")}
            subtitle={`${myActiveTasks} ${t("dash.openTasks")}`}
            action={
              <Link href="/internal/projects" className="inline-flex items-center gap-0.5 hover:text-foreground">
                <span className="hidden sm:inline">{t("dash.allProjects")}</span> <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {myProjects.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("dash.staff.noMyProjects")}</p>}
          <ul className="divide-y divide-line">
            {myProjects.map((p) => (
              <TaskRow key={p.id} done={p.status === "done"} name={p.name} meta={p.clientName} due={p.due} status={p.status} />
            ))}
          </ul>
        </Panel>
      </div>

      {/* Activity feed across clients */}
      <Panel>
        <PanelHeader
          title={t("dash.staff.feedTitle")}
          action={
            <Link href="/chat" className="inline-flex items-center gap-0.5 hover:text-foreground">
              {t("dash.viewAll")} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        {updates.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("dash.staff.noFeed")}</p>}
        <ul className="grid grid-cols-1 divide-y divide-line md:grid-cols-2 md:divide-y-0">
          {updates.map((u, i) => (
            <motion.li
              key={u.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="flex gap-3 px-5 py-3.5 md:border-b md:border-line md:odd:border-r"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="min-w-0 truncate font-display text-sm font-medium text-foreground">{u.title}</p>
                  <Badge variant="outline" className="shrink-0 px-2 py-0 text-[10.5px]">
                    {u.clientName}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-soft">{u.description}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted">{formatRelativeTime(u.created_at)}</span>
            </motion.li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
