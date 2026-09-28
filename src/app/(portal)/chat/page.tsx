import { getAuthUser } from "@/lib/auth";
import { listClients, listMessages, listTeamPeers, listUpdates } from "@/lib/data";
import { ChatView } from "./view";

export default async function ChatPage() {
  const user = await getAuthUser();
  const clientId = user?.client_id ?? null;

  const [messages, updates, peers, clients] = await Promise.all([
    listMessages(clientId),
    listUpdates(clientId),
    listTeamPeers(),
    listClients(),
  ]);

  const clientCompany = user?.company || clients[0]?.company || "";

  return (
    <ChatView
      initialMessages={messages}
      updates={updates}
      peers={peers}
      currentUserId={user?.id ?? "demo"}
      currentName={user?.name ?? "You"}
      currentRole={user?.role ?? "client"}
      clientId={clientId}
      clientCompany={clientCompany}
    />
  );
}
