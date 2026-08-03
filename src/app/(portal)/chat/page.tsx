import { getAuthUser } from "@/lib/auth";
import { listMessages, listTeamPeers, listUpdates } from "@/lib/data";
import { ChatView } from "./view";

export default async function ChatPage() {
  const user = await getAuthUser();
  const clientId = user?.client_id ?? null;

  const [messages, updates, peers] = await Promise.all([
    listMessages(clientId),
    listUpdates(clientId),
    listTeamPeers(),
  ]);

  return (
    <ChatView
      initialMessages={messages}
      updates={updates}
      peers={peers}
      currentUserId={user?.id ?? "demo"}
      currentName={user?.name ?? "You"}
      currentRole={user?.role ?? "client"}
      clientId={clientId}
    />
  );
}
