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
import { Panel, PanelHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChatThread } from "@/components/chat/chat-thread";
import { UpdatesManager } from "@/components/updates/updates-manager";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { MetricsEditor } from "@/components/metrics/metrics-editor";
import { MonthlyReportPanel, type ReportRun } from "@/components/reports/monthly-report-panel";
import { ClientToolAccess } from "@/components/ai/client-tool-access";
import { PartnerProcesses } from "@/components/workflows/partner-processes";
import type { Run, StaffOption, Template } from "@/lib/workflows-shared";
import { HealthBadge, HealthCard } from "@/components/health/health";
import type { ClientHealth } from "@/lib/health";
import { IntegrationsBoard } from "@/app/(portal)/integrations/board";
import { EditClientModal } from "@/components/modals/edit-client-modal";
import { LiveFeedPanel } from "@/components/live-feed/live-feed-panel";
import { useTheme } from "@/lib/theme/theme-provider";
import { buildClientTheme } from "@/lib/theme/themes";
import { PROVIDERS } from "@/lib/integrations/providers";
import { LOWER_IS_BETTER, PROJECT_STATUS } from "@/lib/status";
import { useT, useIntlLocale } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { cn, formatCurrency } from "@/lib/utils";
import type { ChatPeer, Client, DocItem, Kpi, Message, Project, Role, Update } from "@/types";
import type { TeamMember } from "@/lib/data";
import { APP_TZ } from "@/lib/utils";

const TABS = [
  { key: "overview", labelKey: "cd.tab.overview" },
  { key: "metrics", labelKey: "cd.tab.metrics" },
  { key: "chat", labelKey: "cd.tab.chat" },
  { key: "updates", labelKey: "cd.tab.updates" },
  { key: "documents", labelKey: "cd.tab.documents" },
  { key: "processes", labelKey: "cd.tab.processes" },
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
  directory,
  teamMembers = [],
  spend30d = 0,
  leads30d = 0,
  portfolioSpend30d = 0,
  health,
  reportRuns = [],
  lockedTools = [],
  workflowRuns = [],
  workflowTemplates = [],
  workflowStaff = [],
  locale = "de",
  initialTab,
}: {
  /** ?tab= from the URL (e.g. chat notifications open the chat directly). */
  initialTab?: string;
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
  /** Everyone who can read this chat (client users + team): names and photos for "seen by". */
  directory?: ChatPeer[];
  teamMembers?: TeamMember[];
  spend30d?: number;
  leads30d?: number;
  portfolioSpend30d?: number;
  health?: ClientHealth;
  reportRuns?: ReportRun[];
  lockedTools?: string[];
  workflowRuns?: Run[];
  workflowTemplates?: Template[];
  workflowStaff?: StaffOption[];
  locale?: string;
}) {
  const t = useT();
  const dl = useIntlLocale();
  const [tab, setTabState] = useState<TabKey>(
    TABS.some((x) => x.key === initialTab) ? (initialTab as TabKey) : "overview",
  );
  // Keep ?tab= in the address bar so reloads and shared links reopen the same tab.
  const setTab = (next: TabKey) => {
    setTabState(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };
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

  const clientSince = new Date(client.created_at).toLocaleDateString(dl, { timeZone: APP_TZ,
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn(isChat ? "flex h-[calc(100dvh-7rem)] flex-col" : "space-y-5")}>
      <div className={cn("space-y-4", isChat && "shrink-0 pb-4")}>
        {/* Back link */}
        <Link
          href="/internal/clients"
          className="inline-flex items-center gap-1.5 text-body-sm text-soft hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("cd.allClients")}
        </Link>

        {client.archived_at && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {t("cd.archivedBanner")}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Avatar name={client.company} src={client.logo_url} logo size={46} className="rounded-xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-h1 font-semibold tracking-[-0.02em] md:text-2xl">
                  {client.company}
                </h1>
                <Badge variant={client.plan === "Scale" ? "brand" : "positive"}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {client.plan}
                </Badge>
                <HealthBadge health={health} />
              </div>
              <p className="mt-0.5 text-body-sm text-muted">
                {[t("cd.perMonth", { amount: formatCurrency(client.mrr) }), t("cd.clientSince", { date: clientSince }), client.public_feed_label].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden h-9 items-center gap-2 rounded-xl bg-line/70 px-3 sm:flex">
              <span className="text-xs text-muted">{t("cd.brandColors")}</span>
              <span className="h-5 w-5 rounded-full ring-1 ring-border" style={{ background: client.primary_color }} />
              <span className="-ml-1 h-5 w-5 rounded-full ring-1 ring-border" style={{ background: client.secondary_color }} />
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
        <div className="-mx-4 flex overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-3 pb-3 text-sm transition-colors first:pl-1",
                tab === tb.key
                  ? "font-medium text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-brand"
                  : "text-soft hover:text-foreground",
              )}
            >
              {t(tb.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* ───────── Overview ───────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[
              { label: t("cd.mrr"), value: formatCurrency(client.mrr), sub: t("cd.planName", { plan: client.plan }) },
              {
                label: t("cd.adBudget"),
                value: formatCurrency(spend30d),
                sub:
                  portfolioSpend30d > 0 && spend30d > 0
                    ? t("cd.shareOfBudget", {
                        pct: new Intl.NumberFormat(dl, { maximumFractionDigits: 1 }).format((spend30d / portfolioSpend30d) * 100),
                      })
                    : "",
              },
              { label: t("cd.leads30"), value: String(leads30d), sub: costPerLead > 0 ? t("cd.costPerLead", { amount: formatCurrency(costPerLead) }) : "" },
              { label: t("cd.activeProjects"), value: String(activeProjects.length), sub: activeProjects[0]?.name ?? "" },
            ].map((st) => (
              <div key={st.label} className="card min-w-0 px-4 py-4 sm:px-5">
                <p className="eyebrow truncate">{st.label}</p>
                <p className="mt-2 truncate font-display text-h1 font-semibold leading-8 tracking-[-0.03em] sm:text-kpi">{st.value}</p>
                <p className="mt-1 truncate text-xs text-muted">{st.sub || "\u00a0"}</p>
              </div>
            ))}
          </div>

          {/* Main content + sidebar */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
            {/* Projects */}
            <Panel className="min-w-0 self-start">
              <PanelHeader
                title={t("cd.projects")}
                subtitle={t("cd.projectsActive", { active: activeProjects.length, done: doneProjects.length })}
                action={<Link href="/internal/projects" className="hover:text-foreground">{t("cd.manage")}</Link>}
              />
              {projects.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("proj.noProjects")}</p>}
              <ul className="divide-y divide-line">
                {projects.map((p) => {
                  const s = PROJECT_STATUS[p.status];
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-body font-medium text-foreground">{p.name}</p>
                        <div className="mt-2 flex items-center gap-2.5">
                          <Progress value={p.progress} tone={s.tone} className="w-24 sm:w-36" />
                          <span className="font-mono text-caption text-soft">{p.progress}%</span>
                          <span className="truncate text-caption text-muted">
                            {p.due
                              ? t("cd.due", {
                                  date: new Date(p.due).toLocaleDateString(dl, { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" }),
                                })
                              : t("cd.dueOpen")}
                          </span>
                        </div>
                      </div>
                      <Badge variant={s.variant} className="shrink-0">
                        {t(s.label)}
                      </Badge>
                      {p.assigned_to && <Avatar name={p.assigned_to} size={26} className="hidden sm:flex" />}
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {/* Right sidebar */}
            <div className="min-w-0 space-y-4">
              <HealthCard health={health} />

              <Panel>
                <PanelHeader
                  title={t("cd.team")}
                  action={<Link href="/internal/projects" className="hover:text-foreground">{t("cd.change")}</Link>}
                />
                {clientTeam.length === 0 && <p className="px-5 py-6 text-sm text-muted">{t("cd.noTeam")}</p>}
                <ul className="divide-y divide-line">
                  {clientTeam.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                      <Avatar name={m.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-body-sm font-medium text-foreground">{m.name}</p>
                        <p className="truncate text-caption text-muted">{m.role}</p>
                      </div>
                      <Link
                        href={`/internal/team?dm=${m.id}`}
                        aria-label={t("cd.messageMember", { name: m.name })}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-foreground"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader
                  title={t("cd.dataSources")}
                  action={
                    <button type="button" onClick={() => setTab("metrics")} className="hover:text-foreground">
                      {t("cd.manage")}
                    </button>
                  }
                />
                <ul className="divide-y divide-line">
                  {PROVIDERS.map((prov) => {
                    const isConnected = integrations.some((i: any) => i.provider === prov.id && i.status === "connected");
                    return (
                      <li key={prov.id} className="flex items-center gap-2.5 px-5 py-2.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", isConnected ? "bg-positive" : "bg-muted/40")} />
                        <span className="flex-1 text-body-sm text-foreground">{prov.name}</span>
                        <span className={cn("text-xs", isConnected ? "text-positive" : "text-muted")}>
                          {isConnected ? t("cd.connected") : t("cd.open")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          </div>

          {/* Activity */}
          <Panel>
            <PanelHeader
              title={t("cd.activity")}
              subtitle={t("cd.activitySub", { name: client.company })}
              action={
                <button type="button" onClick={() => setTab("updates")} className="hover:text-foreground">
                  {t("cd.fullHistory")}
                </button>
              }
            />
            {updates.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">{t("cd.noActivity")}</p>}
            <ol className="px-5 py-2">
              {updates.slice(0, 4).map((u, i, arr) => (
                <li key={u.id} className="relative flex gap-3 py-3">
                  {i < arr.length - 1 && <span className="absolute bottom-0 left-[15px] top-12 w-px bg-line" />}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand-icon">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-display text-sm font-medium text-foreground">{u.title}</p>
                      <span className="text-caption text-muted">
                        {new Date(u.created_at).toLocaleDateString(dl, { timeZone: APP_TZ, day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-body-sm text-soft">{u.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      )}

      {tab === "overview" && <ClientToolAccess clientId={client.id} locked={lockedTools} />}

      {/* ───────── Invoices & KPIs ───────── */}
      {tab === "metrics" && (
        <div className="space-y-4">
          {/* What the client's dashboard shows right now */}
          <Panel>
            <PanelHeader title={t("cd.liveKpisTitle", { name: client.company })} subtitle={t("cd.liveKpisSub", { n: kpis.length })} />
            {kpis.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="th">{t("cd.metric")}</th>
                      <th className="th text-right">{t("cd.value")}</th>
                      <th className="th hidden text-right sm:table-cell">{t("cd.unit")}</th>
                      <th className="th text-right">Δ %</th>
                      <th className="th hidden text-right sm:table-cell">{t("cd.source")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {kpis.map((k) => (
                      <tr key={k.id}>
                        <td className="px-4 py-3 font-medium text-foreground">{k.label}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-body-sm">
                          {k.unit === "currency" ? formatCurrency(k.value) : k.value}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-muted sm:table-cell">{k.unit}</td>
                        <td className="px-4 py-3 text-right">
                          {k.delta == null ? (
                            <span className="text-xs text-muted">-</span>
                          ) : (
                            <span
                              className={cn(
                                "font-mono text-xs",
                                k.delta === 0
                                  ? "text-muted"
                                  : (k.delta > 0) !== LOWER_IS_BETTER.has(k.metric_name)
                                    ? "text-positive"
                                    : "text-negative",
                              )}
                            >
                              {k.delta > 0 ? "+" : ""}
                              {k.delta}%
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-muted sm:table-cell">{PROVIDERS.find((p) => p.id === k.source)?.name ?? k.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">{t("cd.noKpis")}</p>
            )}
          </Panel>

          {/* Manual entry — always open on this staff-only tab (Figma) */}
          <MetricsEditor clientId={client.id} initialKpis={kpis} />

          {/* This client's data sources: connect, configure, sync */}
          <div>
            <h3 className="mb-1 font-display text-title font-semibold">{t("cd.dataSources")}</h3>
            <IntegrationsBoard
              providers={PROVIDERS}
              rows={integrations}
              clientId={client.id}
              clients={[]}
              isStaff
              liveProviders={liveProviders}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Master data */}
            <Panel className="self-start">
              <PanelHeader title={t("cd.masterData")} />
              <dl className="divide-y divide-line">
                {[
                  [t("cd.company"), client.company],
                  [t("cd.contact"), peers[0]?.name ?? "-"],
                  [t("cd.planLabel"), client.plan],
                  [t("cd.mrr"), formatCurrency(client.mrr)],
                  [t("cd.since"), clientSince],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 px-5 py-2.5">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="truncate text-sm font-medium text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <MonthlyReportPanel
              clientId={client.id}
              enabled={!!client.monthly_report_enabled}
              recipientCount={peers.filter((p) => p.role === "client").length}
              runs={reportRuns}
              locale={locale}
            />
          </div>

          {/* Live feed on the marketing website (LIVE_FEED.md) */}
          <LiveFeedPanel clientId={client.id} />

          {/* Client contacts */}
          {peers.length > 0 && (
            <Panel>
              <PanelHeader title={t("cd.clientContacts")} />
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {peers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <Avatar name={p.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="truncate text-xs text-muted">{p.title ?? p.role}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openClientChat(p.id)}
                      aria-label={t("cd.messageMember", { name: p.name })}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-bg hover:text-foreground"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
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
            clientLogoUrl={client.logo_url}
            peers={peers}
            directory={directory}
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

      {tab === "processes" && (
        <PartnerProcesses
          client={{ id: client.id, company: client.company }}
          runs={workflowRuns}
          templates={workflowTemplates}
          staff={workflowStaff}
        />
      )}
    </div>
  );
}
