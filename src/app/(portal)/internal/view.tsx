"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, Building2, Plus, TrendingUp, Users, Wallet } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { MrrBars } from "@/components/charts/mrr-bars";
import { MRR_SERIES } from "@/lib/mock/data";
import { formatCurrency } from "@/lib/utils";
import type { Client } from "@/types";
import type { TeamLoad } from "@/lib/data";

export interface PipelineColumn {
  stage: string;
  projects: { name: string; client: string }[];
}

export function InternalView({
  clients,
  team,
  pipeline,
}: {
  clients: Client[];
  team: TeamLoad[];
  pipeline: PipelineColumn[];
}) {
  const totalMrr = clients.reduce((a, c) => a + (c.mrr ?? 0), 0);
  const utilization = team.length
    ? Math.round(team.reduce((a, t) => a + t.load, 0) / team.length)
    : 0;

  const stats = [
    { label: "Monthly Recurring Revenue", value: formatCurrency(totalMrr), delta: "+14.2%", icon: Wallet },
    { label: "Active Clients", value: String(clients.length), delta: "live", icon: Building2 },
    { label: "Net Revenue Retention", value: "118%", delta: "+6pts", icon: TrendingUp },
    { label: "Team Utilization", value: `${utilization}%`, delta: utilization > 85 ? "High" : "Healthy", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Internal Hub" subtitle="TyloTech command center — revenue, clients, team & pipeline.">
        <Badge variant="brand" className="gap-1.5">Super Admin · Ilias</Badge>
        <Link href="/internal/onboard">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Onboard client
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="card card-hover p-5"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <Badge variant="success" className="gap-0.5">
                  <ArrowUpRight className="h-3 w-3" />
                  {s.delta}
                </Badge>
              </div>
              <p className="mt-4 font-display text-2xl font-semibold tracking-tight">{s.value}</p>
              <p className="mt-0.5 text-xs text-muted">{s.label}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Revenue growth</CardTitle>
              <p className="mt-0.5 text-xs text-muted">MRR · last 12 months</p>
            </div>
            <Badge variant="success" className="gap-1">
              <TrendingUp className="h-3 w-3" /> +€{(totalMrr - MRR_SERIES[0].mrr).toLocaleString()}
            </Badge>
          </CardHeader>
          <MrrBars data={MRR_SERIES} />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team workload</CardTitle>
          </CardHeader>
          <div className="space-y-4">
            {team.map((t) => (
              <div key={t.id}>
                <div className="mb-1.5 flex items-center gap-2.5">
                  <Avatar name={t.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted">{t.role} · {t.clients} clients</p>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{t.load}%</span>
                </div>
                <Progress value={t.load} tone={t.load > 85 ? "warning" : "brand"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All clients</CardTitle>
          <Badge variant="outline">{clients.length} accounts</Badge>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-3 font-medium">Client</th>
                <th className="pb-3 font-medium">Plan</th>
                <th className="pb-3 font-medium">MRR</th>
                <th className="pb-3 font-medium">Since</th>
                <th className="pb-3 text-right font-medium">Brand</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2">
                  <td className="py-3.5">
                    <Link href={`/internal/clients/${c.id}`} className="flex items-center gap-2.5 group">
                      <span className="h-8 w-8 rounded-lg ring-1 ring-border" style={{ background: `${c.primary_color}26` }}>
                        <span className="flex h-full w-full items-center justify-center text-xs font-semibold" style={{ color: c.primary_color }}>
                          {c.company.slice(0, 2).toUpperCase()}
                        </span>
                      </span>
                      <span className="font-medium text-foreground group-hover:text-brand">{c.company}</span>
                    </Link>
                  </td>
                  <td className="py-3.5">
                    <Badge variant={c.plan === "Enterprise" ? "brand" : "neutral"}>{c.plan}</Badge>
                  </td>
                  <td className="py-3.5 font-medium text-foreground">{formatCurrency(c.mrr)}</td>
                  <td className="py-3.5 text-muted">
                    {new Date(c.created_at).toLocaleDateString("en", { month: "short", year: "numeric" })}
                  </td>
                  <td className="py-3.5">
                    <div className="flex justify-end gap-1">
                      <span className="h-4 w-4 rounded-full ring-1 ring-border" style={{ background: c.primary_color }} />
                      <span className="h-4 w-4 rounded-full ring-1 ring-border" style={{ background: c.secondary_color }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project pipeline</CardTitle>
          <Link href="/internal/projects" className="text-xs font-medium text-brand hover:underline">
            Manage projects
          </Link>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pipeline.map((col) => (
            <div key={col.stage} className="rounded-xl border border-border bg-bg/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{col.stage}</span>
                <Badge variant="neutral">{col.projects.length}</Badge>
              </div>
              <div className="space-y-2">
                {col.projects.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="rounded-lg border border-border bg-surface p-3">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{p.client}</p>
                  </div>
                ))}
                {col.projects.length === 0 && (
                  <p className="px-1 py-2 text-[11px] text-muted/60">No projects</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
