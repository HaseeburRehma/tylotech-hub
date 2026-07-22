import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getClient,
  listDocuments,
  listMessages,
  listProjects,
  listUpdates,
} from "@/lib/data";
import { ClientDetail } from "./detail";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const [user, client] = await Promise.all([getAuthUser(), getClient(params.id)]);
  if (!client) notFound();

  const [messages, updates, documents, projects] = await Promise.all([
    listMessages(client.id),
    listUpdates(client.id),
    listDocuments(client.id),
    listProjects(client.id),
  ]);

  return (
    <ClientDetail
      client={client}
      messages={messages}
      updates={updates}
      documents={documents}
      projects={projects}
      staff={{ id: user?.id ?? "demo", name: user?.name ?? "TyloTech", role: user?.role ?? "team" }}
    />
  );
}
