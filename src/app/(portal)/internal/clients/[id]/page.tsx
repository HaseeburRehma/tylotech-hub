import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getClient,
  getKpis,
  listDocuments,
  listMessages,
  listProjects,
  listUpdates,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { ClientDetail } from "./detail";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const [user, client] = await Promise.all([getAuthUser(), getClient(params.id)]);
  if (!client) notFound();

  const sb = createClient();
  const [messages, updates, documents, projects, kpis, integrationsRes] = await Promise.all([
    listMessages(client.id),
    listUpdates(client.id),
    listDocuments(client.id),
    listProjects(client.id),
    getKpis(client.id),
    sb ? sb.from("integrations").select("*").eq("client_id", client.id) : Promise.resolve({ data: [] as any[] }),
  ]);

  return (
    <ClientDetail
      client={client}
      messages={messages}
      updates={updates}
      documents={documents}
      projects={projects}
      kpis={kpis}
      integrations={(integrationsRes.data ?? []).map(({ access_token, ...r }: any) => ({
        ...r,
        has_token: !!access_token,
      }))}
      liveProviders={PROVIDERS.filter(isProviderLive).map((p) => p.id)}
      staff={{ id: user?.id ?? "demo", name: user?.name ?? "TyloTech", role: user?.role ?? "team" }}
    />
  );
}
