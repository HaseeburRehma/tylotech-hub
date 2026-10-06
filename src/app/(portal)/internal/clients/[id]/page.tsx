import { cookies } from "next/headers";
import { lockedToolSlugs } from "@/lib/tool-access";
import { notFound } from "next/navigation";
import { LOCALE_COOKIE } from "@/lib/i18n/dictionary";
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
  listUpdates,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { ClientDetail } from "./detail";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const [user, client] = await Promise.all([getAuthUser(), getClientByRef(params.id)]);
  if (!client) notFound();
  if (!isStaff(user)) notFound();

  const admin = createAdminClient();
  const [messages, updates, documents, projects, kpis, peers, integrationsRes, teamMembers, portfolio, series] =
    await Promise.all([
      listMessages(client.id),
      listUpdates(client.id),
      listDocuments(client.id),
      listProjects(client.id),
      getKpis(client.id),
      listClientUsers(client.id),
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
  const locale = cookies().get(LOCALE_COOKIE)?.value === "en" ? "en" : "de";

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
      teamMembers={teamMembers}
      spend30d={Number(spend30d.toFixed(2))}
      leads30d={leads30d}
      portfolioSpend30d={portfolio.spend30d}
      health={health}
      reportRuns={(reportRuns ?? []) as ReportRun[]}
      lockedTools={lockedTools}
      locale={locale}
    />
  );
}
