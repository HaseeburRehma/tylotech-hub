import { lockedToolSlugs } from "@/lib/tool-access";
import { listStaff, loadRuns, loadTemplates } from "@/lib/workflows";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { serverLocale } from "@/lib/i18n/server";
import type { ReportRun } from "@/components/reports/monthly-report-panel";
import { getAuthUser, isStaff } from "@/lib/auth";
import {
  getClientByRef,
  getKpis,
  getPortfolioSummary,
  listClientHealth,
  getSeries,
  listClientUsers,
  listDocuments,
  listMessages,
  listProjects,
  listTeamMembers,
  listTeamPeers,
  listUpdates,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { ClientDetail } from "./detail";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [user, client] = await Promise.all([getAuthUser(), getClientByRef(params.id)]);
  if (!client) notFound();
  if (!isStaff(user)) notFound();
  // Readable URLs: old links with the client's UUID (notifications, emails)
  // land on /internal/clients/<slug>, keeping ?tab= etc.
  if (UUID_RE.test(params.id) && client.slug) {
    const qs = new URLSearchParams(
      Object.entries(searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : [])),
    ).toString();
    redirect(`/internal/clients/${client.slug}${qs ? `?${qs}` : ""}`);
  }

  const admin = createAdminClient();
  const [messages, updates, documents, projects, kpis, peers, teamPeers, integrationsRes, teamMembers, portfolio, series] =
    await Promise.all([
      listMessages(client.id),
      listUpdates(client.id),
      listDocuments(client.id),
      listProjects(client.id),
      getKpis(client.id),
      listClientUsers(client.id),
      listTeamPeers(),
      admin
        ? admin.from("integrations").select("*").eq("client_id", client.id)
        : Promise.resolve({ data: [] as any[] }),
      listTeamMembers(),
      getPortfolioSummary(),
      getSeries(client.id),
    ]);
  const health = (await listClientHealth())[client.id];
  const { data: reportRuns } = admin
    ? await admin.from("report_runs").select("period,status,recipients,error,created_at").eq("client_id", client.id).order("period", { ascending: false }).limit(6)
    : { data: [] };
  const lockedTools = admin ? Array.from(await lockedToolSlugs(admin, client.id)) : [];
  const sbUser = createClient();
  const [workflowRuns, workflowTemplates, workflowStaff] = await Promise.all([
    sbUser ? loadRuns(sbUser, { clientId: client.id }) : Promise.resolve([]),
    sbUser ? loadTemplates(sbUser) : Promise.resolve([]),
    admin ? listStaff(admin) : Promise.resolve([]),
  ]);
  const locale = serverLocale();

  // Same window as the portfolio summary: 30 complete days ending yesterday.
  const day = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const recent = series.filter((s) => s.date >= day(30) && s.date <= day(1));
  const spend30d = recent.reduce((s, p) => s + p.spend, 0);
  const leads30d = recent.reduce((s, p) => s + p.leads, 0);

  return (
    <ClientDetail
      initialTab={typeof searchParams.tab === "string" ? searchParams.tab : undefined}
      client={client}
      messages={messages}
      updates={updates}
      documents={documents}
      projects={projects}
      kpis={kpis}
      integrations={(integrationsRes.data ?? []).map(
        ({ access_token, refresh_token, ...r }: any) => ({
          ...r,
          has_token: !!access_token,
        }),
      )}
      liveProviders={PROVIDERS.filter(isProviderLive).map((p) => p.id)}
      staff={{
        id: user?.id ?? "demo",
        name: user?.name ?? "TyloTech",
        role: user?.role ?? "team",
      }}
      peers={peers}
      directory={[...peers, ...teamPeers]}
      teamMembers={teamMembers}
      spend30d={Number(spend30d.toFixed(2))}
      leads30d={leads30d}
      portfolioSpend30d={portfolio.spend30d}
      health={health}
      reportRuns={(reportRuns ?? []) as ReportRun[]}
      lockedTools={lockedTools}
      workflowRuns={workflowRuns}
      workflowTemplates={workflowTemplates}
      workflowStaff={workflowStaff}
      locale={locale}
    />
  );
}
