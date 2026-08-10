import { notFound } from "next/navigation";
import { getAuthUser, isStaff } from "@/lib/auth";
import {
  getClient,
  getKpis,
  listClientUsers,
  listDocuments,
  listMessages,
  listProjects,
  listUpdates,
} from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { ClientDetail } from "./detail";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const [user, client] = await Promise.all([getAuthUser(), getClient(params.id)]);
  if (!client) notFound();
  // This is a staff-only console — never render another tenant's data to a client.
  if (!isStaff(user)) notFound();

  const admin = createAdminClient();
  const [messages, updates, documents, projects, kpis, peers, integrationsRes] = await Promise.all([
    listMessages(client.id),
    listUpdates(client.id),
    listDocuments(client.id),
    listProjects(client.id),
    getKpis(client.id),
    listClientUsers(client.id),
    admin ? admin.from("integrations").select("*").eq("client_id", client.id) : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <ClientDetail
      client={client}
      messages={messages}
      updates={updates}
      documents={documents}
      projects={projects}
      kpis={kpis}
      integrations={(integrationsRes.data ?? []).map(({ access_token, refresh_token, ...r }: any) => ({ ...r, has_token: !!access_token }))}
      liveProviders={PROVIDERS.filter(isProviderLive).map((p) => p.id)}
      staff={{ id: user?.id ?? "demo", name: user?.name ?? "TyloTech", role: user?.role ?? "team" }}
      peers={peers}
    />
  );
}
