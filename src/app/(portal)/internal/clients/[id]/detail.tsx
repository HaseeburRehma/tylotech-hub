"use client";

import { ArrowLeft, BarChart3, FileText, LayoutGrid, MessagesSquare, Newspaper } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChatThread } from "@/components/chat/chat-thread";
import { UpdatesManager } from "@/components/updates/updates-manager";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { MetricsEditor } from "@/components/metrics/metrics-editor";
import { IntegrationsBoard } from "@/app/(portal)/integrations/board";
import { PROVIDERS } from "@/lib/integrations/providers";
import { PROJECT_STATUS } from "@/lib/status";
import { cn, formatCurrency } from "@/lib/utils";
import type { Client, DocItem, Kpi, Message, Project, Role, Update } from "@/types";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "metrics", label: "Metrics & APIs", icon: BarChart3 },
  { key: "chat", label: "Chat", icon: MessagesSquare },
  { key: "updates", label: "Updates", icon: Newspaper },
  { key: "documents", label: "Documents", icon: FileText },
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
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-6">
      <Link href="/internal" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Internal Hub
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-border" style={{ background: `${client.primary_color}26` }}>
            {client.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.logo_url} alt={client.company} className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <span className="text-sm font-semibold" style={{ color: client.primary_color }}>
                {client.company.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{client.company}</h1>
            <p className="text-sm text-muted">
              {client.plan} · {formatCurrency(client.mrr)}/mo
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <span className="h-6 w-6 rounded-full ring-1 ring-border" style={{ background: client.primary_color }} />
          <span className="h-6 w-6 rounded-full ring-1 ring-border" style={{ background: client.secondary_color }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                tab === t.key ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 lg:col-span-1 lg:grid-cols-1">
            <Card className="p-4">
              <p className="text-xs text-muted">MRR</p>
              <p className="mt-1 font-display text-xl font-semibold">{formatCurrency(client.mrr)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Active projects</p>
              <p className="mt-1 font-display text-xl font-semibold">{projects.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted">Client since</p>
              <p className="mt-1 font-display text-sm font-semibold">
                {new Date(client.created_at).toLocaleDateString("en", { month: "long", year: "numeric" })}
              </p>
            </Card>
          </div>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <Link href="/internal/projects" className="text-xs font-medium text-brand hover:underline">
                Manage
              </Link>
            </CardHeader>
            <div className="space-y-4">
              {projects.length === 0 && <p className="text-sm text-muted">No projects yet.</p>}
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
                      <span>{p.assigned_to ?? "Unassigned"}</span>
                      <span>{p.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === "metrics" && (
        <div className="space-y-6">
          <MetricsEditor clientId={client.id} initialKpis={kpis} />
          <div>
            <h3 className="mb-1 text-sm font-semibold">Connected data sources (APIs)</h3>
            <p className="mb-3 text-xs text-muted">
              Connect Meta Ads / Search Console for this client, set the account, then Sync to pull
              live data straight onto their dashboard.
            </p>
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
        <ChatThread
          initialMessages={messages}
          currentUserId={staff.id}
          currentName={staff.name}
          currentRole={staff.role}
          clientId={client.id}
          title={`${client.company} · conversation`}
          subtitle="Live · realtime"
        />
      )}

      {tab === "updates" && <UpdatesManager updates={updates} clientId={client.id} canPost />}

      {tab === "documents" && <DocumentsPanel documents={documents} clientId={client.id} />}
    </div>
  );
}
