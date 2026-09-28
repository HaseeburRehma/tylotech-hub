import { notFound } from "next/navigation";
import { getAuthUser, isStaff } from "@/lib/auth";
import {
  getClientByRef,
  getKpis,
  getSeries,
  listClientUsers,
  listClients,
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
  const [messages, updates, documents, projects, kpis, peers, integrationsRes, teamMembers, allClients, series] =
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
      listClients(),
      getSeries(client.id),
    ]);

  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);
  const sinceStr = since30d.toISOString().slice(0, 10);
  const recent = series.filter((s) => s.date >= sinceStr);
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
      totalClients={allClients.length}
    />
  );
}
