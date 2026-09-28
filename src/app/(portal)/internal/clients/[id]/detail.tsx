"use client";

import {
  ArrowLeft,
  ChevronRight,
  Eye,
  MessageCircle,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChatThread } from "@/components/chat/chat-thread";
import { UpdatesManager } from "@/components/updates/updates-manager";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { MetricsEditor } from "@/components/metrics/metrics-editor";
import { IntegrationsBoard } from "@/app/(portal)/integrations/board";
import { PROVIDERS } from "@/lib/integrations/providers";
import { PROJECT_STATUS } from "@/lib/status";
import { useT } from "@/lib/i18n/provider";
import { cn, formatCurrency } from "@/lib/utils";
import type { ChatPeer, Client, DocItem, Kpi, Message, Project, Role, Update } from "@/types";
import type { TeamMember } from "@/lib/data";

const TABS = [
  { key: "overview", labelKey: "cd.tab.overview" },
  { key: "metrics", labelKey: "cd.tab.metrics" },
  { key: "chat", labelKey: "cd.tab.chat" },
  { key: "updates", labelKey: "cd.tab.updates" },
  { key: "documents", labelKey: "cd.tab.documents" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_LABEL: Record<string, string> = {
  planning: "Planung",
  in_progress: "In Arbeit",
  review: "Review",
  done: "Fertig",
  blocked: "Blockiert",
};

export function ClientDetail({
  client,
  messages,
  updates,
  documents,
  projects,
  kpis,
  integrations,
  liveProviders,
  staff,
  peers = [],
  teamMembers = [],
  spend30d = 0,
  leads30d = 0,
  totalClients = 0,
}: {
  client: Client;
  messages: Message[];
  updates: Update[];
  documents: DocItem[];
  projects: Project[];
  kpis: Kpi[];
  integrations: any[];
  liveProviders: string[];
  staff: { id: string; name: string; role: Role };
  peers?: ChatPeer[];
  teamMembers?: TeamMember[];
  spend30d?: number;
  leads30d?: number;
  totalClients?: number;
}) {
  const t = useT();
  const [tab, setTab] = useState<TabKey>("overview");
  const isChat = tab === "chat";

  const activeProjects = projects.filter(
    (p) => p.status === "in_progress" || p.status === "review",
  );
  const doneProjects = projects.filter((p) => p.status === "done");
  const costPerLead = leads30d > 0 ? spend30d / leads30d : 0;
  const pctOfAccounts =
    totalClients > 0
      ? Math.round((spend30d / (totalClients * spend30d || 1)) * 100)
      : 0;

  const clientSince = new Date(client.created_at).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn(isChat ? "flex h-[calc(100vh-7rem)] flex-col" : "space-y-6")}>
      <div className={cn(isChat && "shrink-0 space-y-6 pb-4")}>
        {/* Back link */}
        <Link
          href="/internal/clients"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("cd.allClients")}
        </Link>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={client.company} size={52} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  {client.company}
                </h1>
                <Badge variant={client.plan === "Scale" ? "brand" : "success"} className="text-[10px]">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {client.plan}
                </Badge>
              </div>
              <p className="text-sm text-muted">
                {formatCurrency(client.mrr)} {t("cd.perMonth", { amount: "" }).trim()} · {t("cd.clientSince", { date: clientSince })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Brand colors */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">{t("cd.brandColors")}</span>
              <span
                className="h-6 w-6 rounded-full ring-1 ring-border"
                style={{ background: client.primary_color }}
              />
              <span
                className="h-6 w-6 rounded-full ring-1 ring-border"
                style={{ background: client.secondary_color }}
              />
            </div>

            <Button variant="outline" size="sm">
              <Eye className="h-4 w-4" />
              {t("cd.viewAsClient")}
            </Button>
            <Button size="sm">
              <Pencil className="h-4 w-4" />
              {t("cd.edit")}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                "relative pb-3 text-sm font-medium transition-colors",
                tab === tb.key
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t(tb.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("cd.mrr")}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
                {formatCurrency(client.mrr)}
              </p>
              <p className="mt-1 text-xs text-muted">{client.plan}-Plan</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("cd.adBudget")}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
                {formatCurrency(spend30d)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {totalClients > 0 ? t("cd.ofAllAccounts", { pct: Math.round((1 / totalClients) * 100) }) : ""}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("cd.leads30")}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
                {leads30d}
              </p>
              <p className="mt-1 text-xs text-muted">
                {costPerLead > 0 ? t("cd.costPerLead", { amount: formatCurrency(costPerLead) }) : ""}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("cd.activeProjects")}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
                {activeProjects.length}
              </p>
              <p className="mt-1 text-xs text-muted">
                {activeProjects[0]?.name ?? ""}
              </p>
            </div>
          </div>

          {/* Main content + sidebar */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Projects */}
            <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{t("cd.projects")}</h3>
                  <p className="text-xs text-muted">
                    {t("cd.projectsActive", {
                      active: activeProjects.length,
                      done: doneProjects.length,
                    })}
                  </p>
                </div>
                <Link
                  href="/internal/projects"
                  className="text-sm font-medium text-brand hover:underline"
                >
                  {t("cd.manage")}
                </Link>
              </div>
              <div className="space-y-4">
                {projects.length === 0 && (
                  <p className="text-sm text-muted">{t("proj.noProjects")}</p>
                )}
                {projects.map((p) => {
                  const s = PROJECT_STATUS[p.status];
                  return (
                    <div key={p.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {p.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.variant} className="text-[10px]">
                            <span
                              className={cn(
                                "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                                {
                                  "bg-muted": p.status === "planning",
                                  "bg-brand": p.status === "in_progress",
                                  "bg-warning": p.status === "review",
                                  "bg-success": p.status === "done",
                                  "bg-danger": p.status === "blocked",
                                },
                              )}
                            />
                            {STATUS_LABEL[p.status] ?? s.label}
                          </Badge>
                          {p.assigned_to && (
                            <Avatar
                              name={p.assigned_to}
                              size={24}
                              className="ring-2 ring-surface"
                            />
                          )}
                        </div>
                      </div>
                      <Progress value={p.progress} tone={s.tone} />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                        <span>{p.progress} %</span>
                        <span>
                          {p.due
                            ? t("cd.due", {
                                date: new Date(p.due).toLocaleDateString(
                                  "de-DE",
                                  { day: "numeric", month: "short", year: "numeric" },
                                ),
                              })
                            : t("cd.dueOpen")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              {/* Team/Betreuung */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{t("cd.team")}</h3>
                  <button className="text-sm font-medium text-brand hover:underline">
                    {t("cd.change")}
                  </button>
                </div>
                <div className="space-y-3">
                  {teamMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} size={36} />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {m.name}
                          </p>
                          <p className="text-xs text-muted">{m.role}</p>
                        </div>
                      </div>
                      <button className="text-muted hover:text-foreground transition-colors">
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data sources */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">
                    {t("cd.dataSources")}
                  </h3>
                  <Link
                    href={`/internal/clients/${client.id}`}
                    onClick={() => setTab("metrics")}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {t("cd.manage")}
                  </Link>
                </div>
                <div className="space-y-3">
                  {["Search Console", "Meta Ads", "Google Ads", "GA4"].map(
                    (source) => {
                      const isConnected = integrations.some(
                        (i: any) =>
                          i.provider
                            ?.replace(/_/g, " ")
                            .toLowerCase() ===
                            source.toLowerCase().replace(/ /g, "_") &&
                          i.status === "connected",
                      );
                      return (
                        <div
                          key={source}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-block h-2 w-2 rounded-full",
                                isConnected ? "bg-brand" : "bg-muted/40",
                              )}
                            />
                            <span className="text-sm text-foreground">
                              {source}
                            </span>
                          </div>
                          <span className="text-xs text-muted">
                            {isConnected ? t("cd.connected") : t("cd.open")}
                          </span>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{t("cd.activity")}</h3>
                <p className="text-xs text-muted">
                  {t("cd.activitySub", { name: client.company })}
                </p>
              </div>
              <button className="text-sm font-medium text-brand hover:underline">
                {t("cd.fullHistory")}
              </button>
            </div>
            <div className="space-y-4">
              {updates.slice(0, 4).map((u) => (
                <div key={u.id} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {u.title}
                    </p>
                    <p className="text-xs text-muted">{u.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {new Date(u.created_at).toLocaleDateString("de-DE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              ))}
              {updates.length === 0 && (
                <p className="text-sm text-muted">No recent activity.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "metrics" && (
        <div className="space-y-6">
          <MetricsEditor clientId={client.id} initialKpis={kpis} />
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("cd.dataSources")}</h3>
            <IntegrationsBoard
              providers={PROVIDERS}
              rows={integrations}
              clientId={client.id}
              clients={[]}
              isStaff
              liveProviders={liveProviders}
            />
          </div>
        </div>
      )}

      {tab === "chat" && (
        <div className="min-h-0 flex-1">
          <ChatThread
            initialMessages={messages}
            currentUserId={staff.id}
            currentName={staff.name}
            currentRole={staff.role}
            clientId={client.id}
            peers={peers}
            title={`${client.company} · team`}
            subtitle="Group · everyone"
            className="h-full"
          />
        </div>
      )}

      {tab === "updates" && (
        <UpdatesManager updates={updates} clientId={client.id} canPost />
      )}

      {tab === "documents" && (
        <DocumentsPanel documents={documents} clientId={client.id} />
      )}
    </div>
  );
}
