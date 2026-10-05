"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, Clock, Plus, TrendingUp, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { MrrBars } from "@/components/charts/mrr-bars";
import { useT } from "@/lib/i18n/provider";
import { formatCurrency } from "@/lib/utils";
import type { Client } from "@/types";
import type { TeamLoad } from "@/lib/data";

export interface PipelineProject {
  name: string;
  client: string;
  clientColor: string;
  assignee: string;
  due: string;
}

export interface PipelineColumn {
  stage: string;
  stageKey: string;
  projects: PipelineProject[];
}

const STAGE_DOT: Record<string, string> = {
  planning: "bg-muted",
  in_progress: "bg-amber-400",
  review: "bg-amber-400",
  done: "bg-brand",
};

const STAGE_I18N: Record<string, string> = {
  planning: "proj.planning",
  in_progress: "proj.inProgress",
  review: "proj.review",
  done: "proj.done",
};

export function InternalView({
  clients,
  team,
  pipeline,
  mrrSeries,
  projectCount,
}: {
  clients: Client[];
  team: TeamLoad[];
  pipeline: PipelineColumn[];
  mrrSeries: { month: string; mrr: number }[];
  projectCount: number;
}) {
  const tr = useT();
  const totalMrr = clients.reduce((a, c) => a + (c.mrr ?? 0), 0);
  const teamActive = team.reduce((a, t) => a + t.activeProjects, 0);
  const avgActive = team.length ? teamActive / team.length : 0;
  const activeProjects = pipeline
    .filter((c) => c.stageKey !== "done")
    .reduce((a, c) => a + c.projects.length, 0);
  const managedClients = new Set(pipeline.flatMap((c) => (c.stageKey === "done" ? [] : c.projects.map((p) => p.client)))).size;
  const uniqueClients = new Set(pipeline.flatMap((c) => c.projects.map((p) => p.client)));

  const mrrNow = mrrSeries[mrrSeries.length - 1]?.mrr ?? totalMrr;
  const mrrPrev = mrrSeries[mrrSeries.length - 2]?.mrr ?? 0;
  const mrrDeltaPct = mrrPrev > 0 ? ((mrrNow - mrrPrev) / mrrPrev) * 100 : null;
  const mrrGrowth12m = mrrNow - (mrrSeries[0]?.mrr ?? 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const newClientsThisMonth = clients.filter((c) => new Date(c.created_at) >= monthStart).length;
  const pct = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, signDisplay: "always" });

  return (
    <div className="space-y-6">
      <PageHeader title={tr("hub.title")} subtitle={tr("hub.subtitle")}>
        <Badge variant="brand" className="gap-1.5">Super Admin</Badge>
        <Link href="/internal/team/new">
          <Button size="sm" variant="outline">
            <Users className="h-4 w-4" />
            {tr("hub.newTeam")}
          </Button>
        </Link>
        <Link href="/internal/onboard">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            {tr("hub.newClient")}
          </Button>
        </Link>
      </PageHeader>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: tr("hub.mrr"),
            value: formatCurrency(totalMrr),
            badge: (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {tr("hub.live")}
              </span>
            ),
            delta:
              mrrDeltaPct === null ? (
                <span className="text-xs text-muted">{tr("hub.noPrevMonth")}</span>
              ) : (
                <Badge variant={mrrDeltaPct >= 0 ? "success" : "danger"} className="gap-0.5">
                  <ArrowUpRight className={mrrDeltaPct >= 0 ? "h-3 w-3" : "h-3 w-3 rotate-90"} />
                  {pct.format(mrrDeltaPct)} %
                </Badge>
              ),
          },
          {
            label: tr("hub.activeClients"),
            value: String(clients.length),
            badge: (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {tr("hub.live")}
              </span>
            ),
            delta:
              newClientsThisMonth > 0 ? (
                <Badge variant="success" className="gap-0.5">
                  <ArrowUpRight className="h-3 w-3" />
                  +{newClientsThisMonth} {tr("hub.thisMonth")}
                </Badge>
              ) : (
                <span className="text-xs text-muted">{tr("hub.noNewClients")}</span>
              ),
          },
          {
            label: tr("hub.activeProjects"),
            value: String(activeProjects),
            badge: null,
            delta: (
              <span className="text-xs text-muted">
                {tr("hub.projectsTotal", { n: projectCount })}
              </span>
            ),
          },
          {
            label: tr("hub.teamUtil"),
            value: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(avgActive),
            badge: null,
            delta: <span className="text-xs text-muted">{tr("hub.perPerson", { n: team.length })}</span>,
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="card card-hover p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {s.label}
              </span>
              {s.badge}
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{s.value}</p>
            <div className="mt-1">{s.delta}</div>
          </motion.div>
        ))}
      </div>

      {/* Revenue chart + Team panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{tr("hub.revenueTitle")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">{tr("hub.revenueSub")}</p>
            </div>
            <Badge variant={mrrGrowth12m > 0 ? "success" : mrrGrowth12m < 0 ? "danger" : "neutral"} className="gap-1">
              <TrendingUp className={mrrGrowth12m < 0 ? "h-3 w-3 rotate-180" : "h-3 w-3"} /> {mrrGrowth12m > 0 ? "+" : ""}
              {formatCurrency(mrrGrowth12m)} {tr("hub.perYear")}
            </Badge>
          </CardHeader>
          <MrrBars data={mrrSeries} />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{tr("hub.teamTitle")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {tr("hub.teamMembers", { n: team.length, m: managedClients })}
              </p>
            </div>
            <Link href="/internal/team" className="text-xs font-medium text-brand hover:underline">
              {tr("hub.teamLink")}
            </Link>
          </CardHeader>
          <div className="space-y-4">
            {team.map((t) => (
              <div key={t.id}>
                <div className="mb-1.5 flex items-center gap-2.5">
                  <Avatar name={t.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted">
                      {t.role} · {t.clients} {tr("hub.accounts")}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {tr("hub.activeCount", { n: t.activeProjects })}
                  </span>
                </div>
                {/* Share of all active projects carried by this member. */}
                <Progress value={teamActive ? (t.activeProjects / teamActive) * 100 : 0} tone="brand" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Pipeline */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>{tr("hub.pipelineTitle")}</CardTitle>
            <p className="mt-0.5 text-xs text-muted">
              {tr("hub.pipelineSub", { n: activeProjects, m: uniqueClients.size })}
            </p>
          </div>
          <Link href="/internal/projects" className="text-xs font-medium text-brand hover:underline">
            {tr("hub.allProjects")}
          </Link>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pipeline.map((col) => (
            <div key={col.stageKey} className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${STAGE_DOT[col.stageKey] ?? "bg-muted"}`} />
                  {tr(STAGE_I18N[col.stageKey] ?? col.stage)}
                </span>
                <Badge variant="neutral">{col.projects.length}</Badge>
              </div>
              <div className="space-y-2">
                {col.projects.map((p, i) => {
                  const initials = p.client
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div key={`${p.name}-${i}`} className="rounded-lg border border-border bg-surface p-3">
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                            style={{ background: p.clientColor }}
                          >
                            {initials}
                          </span>
                          <span className="text-[11px] text-muted">{p.client}</span>
                        </div>
                        {p.assignee && (
                          <Avatar name={p.assignee} size={24} />
                        )}
                      </div>
                      {p.due && (
                        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
                          <Clock className="h-3 w-3" />
                          {new Date(p.due).toLocaleDateString("de-DE", {
                            day: "numeric",
                            month: "short",
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {col.projects.length === 0 && (
                  <p className="px-1 py-2 text-[11px] text-muted/60">—</p>
                )}
              </div>
              <Link
                href="/internal/projects"
                className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted transition-colors hover:border-brand hover:text-brand"
              >
                <Plus className="h-3 w-3" />
                {tr("hub.addProject")}
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
