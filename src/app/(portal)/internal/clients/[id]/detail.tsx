"use client";

import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Eye,
  MessageCircle,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChatThread } from "@/components/chat/chat-thread";
import { UpdatesManager } from "@/components/updates/updates-manager";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { MetricsEditor } from "@/components/metrics/metrics-editor";
import { HealthBadge, HealthCard } from "@/components/health/health";
import type { ClientHealth } from "@/lib/health";
import { IntegrationsBoard } from "@/app/(portal)/integrations/board";
import { EditClientModal } from "@/components/modals/edit-client-modal";
import { LiveFeedPanel } from "@/components/live-feed/live-feed-panel";
import { useTheme } from "@/lib/theme/theme-provider";
import { buildClientTheme } from "@/lib/theme/themes";
import { PROVIDERS } from "@/lib/integrations/providers";
import { LOWER_IS_BETTER, PROJECT_STATUS } from "@/lib/status";
import { useT } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
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
  portfolioSpend30d = 0,
  health,
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
  portfolioSpend30d?: number;
  health?: ClientHealth;
}) {
  const t = useT();
  const [tab, setTab] = useState<TabKey>("overview");
  const [showKpiEditor, setShowKpiEditor] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const user = useUser();

  async function toggleArchive() {
    const archive = !client.archived_at;
    if (archive && !confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    setConfirmArchive(false);
    setArchiving(true);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archive }),
    }).catch(() => null);
    setArchiving(false);
    if (res?.ok) {
      if (archive) router.push("/internal/clients");
      else router.refresh();
    }
  }
  const [chatWith, setChatWith] = useState<string | null>(null);
  const router = useRouter();
  const { setThemeOverride } = useTheme();
  const isChat = tab === "chat";

  // The client's team = staff assigned to its projects.
  const clientTeam = useMemo(() => {
    const ids = new Set(projects.map((p) => p.assigned_to_id).filter(Boolean));
    return teamMembers.filter((m) => ids.has(m.id));
  }, [projects, teamMembers]);

  function viewAsClient() {
    setThemeOverride(
      buildClientTheme({
        id: client.id,
        company: client.company,
        primary: client.primary_color,
        secondary: client.secondary_color,
        logoUrl: client.logo_url,
      }),
    );
    router.push(`/performance?client=${encodeURIComponent(client.slug ?? client.id)}`);
  }

  function openClientChat(peerId: string) {
    setChatWith(peerId);
    setTab("chat");
  }

  const activeProjects = projects.filter(
    (p) => p.status === "in_progress" || p.status === "review",
  );
  const doneProjects = projects.filter((p) => p.status === "done");
  const costPerLead = leads30d > 0 ? spend30d / leads30d : 0;

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

        {client.archived_at && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {t("cd.archivedBanner")}
          </div>
        )}

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
                <HealthBadge health={health} />
              </div>
              <p className="text-sm text-muted">
                {formatCurrency(client.mrr)} {t("cd.perMonth", { amount: "" }).trim()} · {t("cd.clientSince", { date: clientSince })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

            <Button variant="outline" size="sm" onClick={viewAsClient}>
              <Eye className="h-4 w-4" />
              {t("cd.viewAsClient")}
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t("cd.edit")}
            </Button>
            {user.role === "admin" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleArchive}
                onBlur={() => setConfirmArchive(false)}
                loading={archiving}
                className={confirmArchive ? "text-danger" : undefined}
              >
                <Archive className="h-4 w-4" />
                {client.archived_at ? t("clients.restore") : confirmArchive ? t("cd.confirmArchive") : t("cd.archive")}
              </Button>
            )}
          </div>
        </div>

        <EditClientModal open={editing} onClose={() => setEditing(false)} client={client} />

        {/* Tabs */}
        <div className="flex gap-6 overflow-x-auto border-b border-border">
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

      {/* ───────── Overview ───────── */}
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
              <p className="mt-1 text-xs text-muted">{t("cd.planName", { plan: client.plan })}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("cd.adBudget")}
              </p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
                {formatCurrency(spend30d)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {portfolioSpend30d > 0 && spend30d > 0
                  ? t("cd.shareOfBudget", {
                      pct: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format((spend30d / portfolioSpend30d) * 100),
                    })
                  : ""}
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
                            {t(s.label)}
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
              <HealthCard health={health} />
              {/* Team */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{t("cd.team")}</h3>
                  <Link href="/internal/projects" className="text-sm font-medium text-brand hover:underline">
                    {t("cd.change")}
                  </Link>
                </div>
                <div className="space-y-3">
                  {clientTeam.length === 0 && <p className="text-sm text-muted">{t("cd.noTeam")}</p>}
                  {clientTeam.map((m) => (
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
                      <Link
                        href={`/internal/team?dm=${m.id}`}
                        aria-label={t("cd.messageMember", { name: m.name })}
                        className="text-muted transition-colors hover:text-foreground"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Link>
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
                  <button
                    onClick={() => setTab("metrics")}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {t("cd.manage")}
                  </button>
                </div>
                <div className="space-y-3">
                  {PROVIDERS.map((prov) => prov.name).map(
                    (source) => {
                      const id = PROVIDERS.find((p) => p.name === source)?.id;
                      const isConnected = integrations.some(
                        (i: any) => i.provider === id && i.status === "connected",
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
              <button
                type="button"
                onClick={() => setTab("updates")}
                className="text-sm font-medium text-brand hover:underline"
              >
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
                <p className="text-sm text-muted">{t("cd.noActivity")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────── Invoices & KPIs ───────── */}
      {tab === "metrics" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr]">
            {/* Left: Stammblatt + Team */}
            <div className="space-y-4">
              {/* Master data */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <h3 className="mb-4 font-semibold text-foreground">{t("cd.masterData")}</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <span className="text-xs text-muted">{t("cd.company")}</span>
                    <span className="text-sm font-medium text-foreground">{client.company}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <span className="text-xs text-muted">{t("cd.contact")}</span>
                    <span className="text-sm font-medium text-foreground">{peers[0]?.name ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <span className="text-xs text-muted">{t("cd.industry")}</span>
                    <span className="text-sm text-muted">—</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <span className="text-xs text-muted">{t("cd.planLabel")}</span>
                    <Badge variant={client.plan === "Scale" ? "brand" : "success"} className="text-[10px]">
                      {client.plan}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <span className="text-xs text-muted">{t("cd.mrr")}</span>
                    <span className="text-sm font-medium text-foreground">{formatCurrency(client.mrr)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{t("cd.since")}</span>
                    <span className="text-sm font-medium text-foreground">{clientSince}</span>
                  </div>
                </div>
              </div>

              {/* Live feed on the marketing website (LIVE_FEED.md) */}
              <LiveFeedPanel clientId={client.id} />

              {/* Team */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{t("cd.team")}</h3>
                  <Link href="/internal/projects" className="text-sm font-medium text-brand hover:underline">
                    {t("cd.change")}
                  </Link>
                </div>
                <div className="space-y-3">
                  {clientTeam.length === 0 && <p className="text-sm text-muted">{t("cd.noTeam")}</p>}
                  {clientTeam.map((m) => (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar name={m.name} size={36} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{m.name}</p>
                        <p className="text-xs text-muted">{m.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data sources */}
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{t("cd.dataSources")}</h3>
                  <span className="text-xs text-muted">
                    {integrations.filter((i: any) => i.status === "connected").length}/{["Search Console", "Meta Ads", "Google Ads", "GA4"].length} {t("cd.connected")}
                  </span>
                </div>
                <div className="space-y-3">
                  {["Search Console", "Meta Ads", "Google Ads", "GA4"].map((source) => {
                    const isConnected = integrations.some(
                      (i: any) =>
                        i.provider?.replace(/_/g, " ").toLowerCase() ===
                          source.toLowerCase().replace(/ /g, "_") && i.status === "connected",
                    );
                    return (
                      <div key={source} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("inline-block h-2 w-2 rounded-full", isConnected ? "bg-brand" : "bg-muted/40")} />
                          <span className="text-sm text-foreground">{source}</span>
                        </div>
                        <span className="text-xs text-muted">{isConnected ? t("cd.connected") : t("cd.open")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Dashboard KPIs table */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{t("cd.dashKpis")}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowKpiEditor(!showKpiEditor)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t("cd.editKpis")}
                  </Button>
                </div>

                {kpis.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="pb-2.5 text-xs font-medium text-muted">{t("cd.metric")}</th>
                          <th className="pb-2.5 text-xs font-medium text-muted text-right">{t("cd.value")}</th>
                          <th className="pb-2.5 text-xs font-medium text-muted text-right">{t("cd.unit")}</th>
                          <th className="pb-2.5 text-xs font-medium text-muted text-right">Δ %</th>
                          <th className="pb-2.5 text-xs font-medium text-muted text-right">{t("cd.source")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {kpis.map((k) => (
                          <tr key={k.id} className="group">
                            <td className="py-3 font-medium text-foreground">{k.label}</td>
                            <td className="py-3 text-right tabular-nums">
                              {k.unit === "currency" ? formatCurrency(k.value) : k.value}
                            </td>
                            <td className="py-3 text-right text-muted">{k.unit}</td>
                            <td className="py-3 text-right">
                              {k.delta == null ? (
                                <span className="text-xs text-muted">—</span>
                              ) : (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-0.5 text-xs font-medium",
                                    k.delta === 0
                                      ? "text-muted"
                                      : (k.delta > 0) !== LOWER_IS_BETTER.has(k.metric_name)
                                        ? "text-success"
                                        : "text-danger",
                                  )}
                                >
                                  {k.delta > 0 ? "+" : ""}
                                  {k.delta}%
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-right text-muted">{k.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t("cd.noKpis")}</p>
                )}
              </div>

              {/* KPI Editor (collapsible) */}
              {showKpiEditor && (
                <MetricsEditor clientId={client.id} initialKpis={kpis} />
              )}

              {/* Integrations board (collapsible behind editor) */}
              {showKpiEditor && (
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
              )}
            </div>
          </div>

          {/* Client contacts */}
          {peers.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="mb-4 font-semibold text-foreground">{t("cd.clientContacts")}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {peers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Avatar name={p.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted">{p.title ?? p.role}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openClientChat(p.id)}
                      aria-label={t("cd.messageMember", { name: p.name })}
                      className="text-muted transition-colors hover:text-foreground"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────── Chat ───────── */}
      {tab === "chat" && (
        <div className="min-h-0 flex-1">
          <ChatThread
            initialMessages={messages}
            currentUserId={staff.id}
            currentName={staff.name}
            currentRole={staff.role}
            clientId={client.id}
            peers={peers}
            initialSelected={chatWith}
            title={`${client.company} · Team`}
            className="h-full"
          />
        </div>
      )}

      {/* ───────── Updates ───────── */}
      {tab === "updates" && (
        <UpdatesManager updates={updates} clientId={client.id} canPost />
      )}

      {/* ───────── Documents ───────── */}
      {tab === "documents" && (
        <DocumentsPanel documents={documents} clientId={client.id} />
      )}
    </div>
  );
}
