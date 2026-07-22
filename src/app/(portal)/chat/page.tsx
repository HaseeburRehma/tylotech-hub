import { getAuthUser } from "@/lib/auth";
import { listMessages, listUpdates } from "@/lib/data";
import { ChatView } from "./view";

export default async function ChatPage() {
  const user = await getAuthUser();
  const clientId = user?.client_id ?? null;

  const [messages, updates] = await Promise.all([
    listMessages(clientId),
    listUpdates(clientId),
  ]);

  return (
    <ChatView
      initialMessages={messages}
      updates={updates}
      currentUserId={user?.id ?? "demo"}
      currentName={user?.name ?? "You"}
      currentRole={user?.role ?? "client"}
      clientId={clientId}
    />
  );
}
