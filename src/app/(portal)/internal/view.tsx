"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowUpRight, ChevronRight, Clock, KeyRound, Plus, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, Panel, PanelHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { MrrBars } from "@/components/charts/lazy";
import { HealthBadge } from "@/components/health/health";
import { InboxCard } from "@/components/chat/inbox-card";
import type { ClientHealth } from "@/lib/health";
import { useT, useIntlLocale } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client } from "@/types";
import type { TeamLoad } from "@/lib/data";

type TeamLoadWithProcesses = TeamLoad & { activeSteps: number };
import { APP_TZ } from "@/lib/utils";

export interface PipelineProject {
  name: string;
  client: string;
  clientColor: string;
  clientLogo?: string | null;
  assignee: string;
  due: string;
}

export interface PipelineColumn {
  stage: string;
  stageKey: string;
  projects: PipelineProject[];
}

export interface ProcessPipelineRun {
  id: string;
  name: string;
  status: "active" | "completed" | "paused";
  client: string;
  clientColor: string;
  clientLogo?: string | null;
  assignee: string;
  currentStep: string | null;
  progress: number;
  totalSteps: number;
  finishedSteps: number;
}

const STAGE_DOT: Record<string, string> = {
  planning: "bg-muted/60",
  in_progress: "bg-brand",
  review: "bg-positive/60",
  blocked: "bg-negative",
  done: "bg-positive",
};

/** Teal chip for a change in the good direction, rust for the bad one (Figma "Delta"). */
function DeltaChip({ up, children }: { up: boolean; children: React.ReactNode }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md py-0.5 pl-1.5 pr-2 font-mono text-caption font-medium leading-[14px]",
        up ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative",
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function LiveChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[5px] bg-positive/10 py-px pl-1.5 pr-[7px] font-mono text-eyebrow font-medium leading-3 text-positive">
      <span className="h-[5px] w-[5px] rounded-full bg-positive" />
      {label}
    </span>
  );
}

const STAGE_I18N: Record<string, string> = {
  planning: "proj.planning",
  in_progress: "proj.inProgress",
  review: "proj.review",
  blocked: "proj.blocked",
  done: "proj.done",
};

export function InternalView({
  clients,
  team,
  pipeline,
  processPipeline = [],
  mrrSeries,
  projectCount,
  processCount = 0,
  health = {},
}: {
  clients: Client[];
  team: TeamLoadWithProcesses[];
  pipeline: PipelineColumn[];
  processPipeline?: ProcessPipelineRun[];
  mrrSeries: { month: string; mrr: number }[];
  projectCount: number;
  processCount?: number;
  health?: Record<string, ClientHealth>;
}) {
  const tr = useT();
  const dl = useIntlLocale();
  const user = useUser();
  const totalMrr = clients.reduce((a, c) => a + (c.mrr ?? 0), 0);
  const teamActive = team.reduce((a, t) => a + t.activeProjects, 0);
  const avgActive = team.length ? teamActive / team.length : 0;
  const activeProjects = pipeline
    .filter((c) => c.stageKey !== "done")
    .reduce((a, c) => a + c.projects.length, 0);
  const managedClients = new Set(pipeline.flatMap((c) => (c.stageKey === "done" ? [] : c.projects.map((p) => p.client)))).size;
  const uniqueClients = new Set(pipeline.flatMap((c) => c.projects.map((p) => p.client)));
  const activeProcesses = processPipeline.filter((r) => r.status === "active").length;
  const processClients = new Set(processPipeline.map((r) => r.client));

  const mrrNow = mrrSeries[mrrSeries.length - 1]?.mrr ?? totalMrr;
  const mrrPrev = mrrSeries[mrrSeries.length - 2]?.mrr ?? 0;
  const mrrDeltaPct = mrrPrev > 0 ? ((mrrNow - mrrPrev) / mrrPrev) * 100 : null;
  const mrrGrowth12m = mrrNow - (mrrSeries[0]?.mrr ?? 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const newClientsThisMonth = clients.filter((c) => new Date(c.created_at) >= monthStart).length;
  const pct = new Intl.NumberFormat(dl, { maximumFractionDigits: 1, signDisplay: "always" });

  const stats = [
    {
      label: tr("hub.mrr"),
      value: formatCurrency(totalMrr),
      live: true,
      extra:
        mrrDeltaPct === null ? (
          <span className="text-caption text-muted">{tr("hub.noPrevMonth")}</span>
        ) : (
          <DeltaChip up={mrrDeltaPct >= 0}>{pct.format(mrrDeltaPct)}%</DeltaChip>
        ),
    },
    {
      label: tr("hub.activeClients"),
      value: String(clients.length),
      live: true,
      extra:
        newClientsThisMonth > 0 ? (
          <DeltaChip up>+{newClientsThisMonth} {tr("hub.thisMonth")}</DeltaChip>
        ) : (
          <span className="text-caption text-muted">{tr("hub.noNewClients")}</span>
        ),
    },
    {
      label: tr("hub.activeProjects"),
      value: String(activeProjects),
      live: false,
      extra: <span className="text-caption text-muted">{tr("hub.projectsTotal", { n: projectCount })}</span>,
    },
    {
      label: tr("hub.activeProcesses"),
      value: String(activeProcesses),
      live: false,
      extra: <span className="text-caption text-muted">{tr("hub.processesTotal", { n: processCount })}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={tr("hub.title")}
        subtitle={tr("hub.subtitle")}
        badge={
          user.role === "admin" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/60 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
              <KeyRound className="h-3 w-3 text-brand-ink" />
              Super Admin
            </span>
          )
        }
      >
        {user.role === "admin" && (
          <ButtonLink href="/internal/team/new" size="sm" variant="outline">
              <UserPlus className="h-4 w-4" />
              {tr("hub.newTeam")}
            </ButtonLink>
        )}
        <ButtonLink href="/internal/onboard" size="sm">
            <Plus className="h-4 w-4" />
            {tr("hub.newClient")}
          </ButtonLink>
      </PageHeader>

      {/* Stats row — two per row on phones, four from xl */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="card min-w-0 px-4 py-3.5 sm:px-5"
          >
            <div className="flex items-center gap-2">
              <span className="eyebrow min-w-0 flex-1 truncate">{s.label}</span>
              {s.live && <LiveChip label={tr("hub.live")} />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <p className="font-display text-h1 font-semibold leading-8 tracking-[-0.03em] text-foreground sm:text-kpi">
                {s.value}
              </p>
              {s.extra}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Revenue chart + team utilisation */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel className="min-w-0">
          <PanelHeader
            title={tr("hub.revenueTitle")}
            subtitle={tr("hub.revenueSub")}
            action={
              <span className={mrrGrowth12m < 0 ? "text-negative" : undefined}>
                {mrrGrowth12m > 0 ? "+" : ""}
                {formatCurrency(mrrGrowth12m)} {tr("hub.perYear")}
              </span>
            }
          />
          <div className="px-2 pt-2 sm:px-4">
            <MrrBars data={mrrSeries} />
          </div>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title={tr("hub.teamTitle")}
            subtitle={tr("hub.teamMembers", { n: team.length, m: managedClients })}
            action={
              <Link href="/internal/team/members" className="hover:text-foreground">
                {tr("members.manage")}
              </Link>
            }
          />
          {team.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">-</p>}
          <ul className="divide-y divide-line">
            {team.map((t) => {
              const share = teamActive ? Math.round((t.activeProjects / teamActive) * 100) : 0;
              return (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2">
                  <Avatar name={t.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-body-sm font-medium leading-[18px] text-foreground">{t.name}</p>
                    <p className="truncate text-caption leading-[15px] text-muted">
                      {t.role} · {t.clients} {tr("hub.accounts")}
                    </p>
                  </div>
                  {/* Share of all active projects carried by this member. */}
                  <div className="hidden h-1.5 w-[86px] shrink-0 overflow-hidden rounded-full bg-line min-[400px]:block" title={`${share}%`}>
                    <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono text-xs text-soft">
                    {tr("hub.activeCount", { n: t.activeProjects })}
                    {t.activeSteps > 0 && (
                      <span className="block text-brand-ink">{tr("hub.activeSteps", { n: t.activeSteps })}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* Pipeline board — columns side by side, swipeable on small screens */}
      <Panel>
        <PanelHeader
          title={tr("hub.pipelineTitle")}
          subtitle={tr("hub.pipelineSub", { n: activeProjects, m: uniqueClients.size })}
          action={
            <Link href="/internal/projects" className="inline-flex items-center gap-0.5 hover:text-foreground">
              {tr("hub.allProjects")} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <div className="flex snap-x snap-mandatory overflow-x-auto lg:snap-none">
          {pipeline.map((col, ci) => (
            <div
              key={col.stageKey}
              className={cn(
                "flex w-[78%] min-w-[240px] shrink-0 snap-start flex-col gap-2 px-4 pb-3.5 pt-3 sm:w-[46%] lg:w-auto lg:min-w-0 lg:flex-1",
                ci > 0 && "border-l border-line",
              )}
            >
              <div className="flex items-center gap-2 pb-0.5">
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STAGE_DOT[col.stageKey] ?? "bg-muted")} />
                <span className="eyebrow">{tr(STAGE_I18N[col.stageKey] ?? col.stage)}</span>
                <span className="ml-auto font-mono text-eyebrow text-muted">{col.projects.length}</span>
              </div>
              {col.projects.map((p, i) => (
                <div key={`${p.name}-${i}`} className="rounded-xl border border-line bg-surface px-3 pb-2 pt-2.5 shadow-card">
                  <p className="font-display text-body-sm font-medium leading-[18px] text-foreground">{p.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {p.clientLogo ? (
                      <Avatar name={p.client} src={p.clientLogo} logo size={20} className="rounded-md" />
                    ) : (
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-eyebrow font-semibold text-white"
                        style={{ background: p.clientColor }}
                      >
                        {p.client.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-caption text-muted">{p.client}</span>
                    {p.assignee && <Avatar name={p.assignee} size={20} className="text-eyebrow" />}
                  </div>
                  {p.due && (
                    <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-1.5 text-caption text-muted">
                      <Clock className="h-3 w-3" />
                      {new Date(p.due).toLocaleDateString(dl, { timeZone: APP_TZ, day: "numeric", month: "short" })}
                    </div>
                  )}
                </div>
              ))}
              <Link
                href="/internal/projects"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 font-display text-xs font-medium text-muted transition-colors hover:border-brand hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                {tr("hub.addProject")}
              </Link>
            </div>
          ))}
        </div>
      </Panel>

      {/* Process pipeline — active runs as cards */}
      {processPipeline.length > 0 && (
        <Panel>
          <PanelHeader
            title={tr("hub.processPipelineTitle")}
            subtitle={tr("hub.processPipelineSub", { n: activeProcesses, m: processClients.size })}
            action={
              <Link href="/internal/processes" className="inline-flex items-center gap-0.5 hover:text-foreground">
                {tr("hub.allProcesses")} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {processPipeline.map((r) => (
              <Link
                key={r.id}
                href={`/internal/processes/${r.id}`}
                className="rounded-xl border border-line bg-surface px-3 pb-2.5 pt-3 shadow-card transition-colors hover:border-brand/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      r.status === "active" ? "bg-brand" : r.status === "paused" ? "bg-warning" : "bg-positive",
                    )}
                  />
                  <p className="min-w-0 flex-1 truncate font-display text-body-sm font-medium leading-[18px] text-foreground">
                    {r.name}
                  </p>
                </div>
                {r.currentStep && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-caption text-muted">
                    <Activity className="h-3 w-3 shrink-0 text-brand-ink" />
                    <span className="truncate">{r.currentStep}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  {r.clientLogo ? (
                    <Avatar name={r.client} src={r.clientLogo} logo size={20} className="rounded-md" />
                  ) : (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-eyebrow font-semibold text-white"
                      style={{ background: r.clientColor }}
                    >
                      {r.client.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-caption text-muted">{r.client}</span>
                  {r.assignee && <Avatar name={r.assignee} size={20} className="text-eyebrow" />}
                </div>
                <div className="mt-2 border-t border-line pt-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${r.progress}%` }} />
                    </div>
                    <span className="font-mono text-eyebrow text-muted">
                      {r.finishedSteps}/{r.totalSteps}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            <Link
              href="/internal/processes"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-8 font-display text-xs font-medium text-muted transition-colors hover:border-brand hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              {tr("hub.addProcess")}
            </Link>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Partners waiting for a reply (chat inbox, migration 0042) */}
        <InboxCard clients={clients} />

        {/* Clients needing attention (health score) */}
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{tr("health.hubTitle")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">{tr("health.hubSub")}</p>
            </div>
            <Link href="/internal/clients" className="shrink-0 text-xs font-medium text-soft hover:text-foreground">
              {tr("cd.allClients")}
            </Link>
          </CardHeader>
          {(() => {
            const needing = clients
              .filter((c) => health[c.id]?.level === "risk" || health[c.id]?.level === "watch")
              .sort((a, b) => (health[a.id]?.score ?? 100) - (health[b.id]?.score ?? 100))
              .slice(0, 5);
            if (!needing.length) {
              return <p className="py-4 text-center text-sm text-muted">{tr("health.hubEmpty")}</p>;
            }
            return (
              <ul className="divide-y divide-line">
                {needing.map((c) => {
                  const h = health[c.id];
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/internal/clients/${c.slug ?? c.id}`}
                        className="flex items-center gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-surface-2"
                      >
                        <HealthBadge health={h} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{c.company}</span>
                          {h?.topIssue && (
                            <span className="block truncate text-xs text-muted">{tr(h.topIssue.reason, h.topIssue.params)}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </Card>
      </div>
    </div>
  );
}
