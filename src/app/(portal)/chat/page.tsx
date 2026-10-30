import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { listClientUsers, listMessages, listTeamPeers, listUpdates, pickStaffClient } from "@/lib/data";
import { ChatView } from "./view";

export default async function ChatPage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();

  // Staff have no client of their own — show the client picked in the sidebar
  // (same as /projects and /documents), so messages load and replies go to that
  // client's channel instead of the internal team chat.
  let clientId = user?.client_id ?? null;
  let clientCompany = user?.company ?? "";
  let clientLogoUrl = user?.logoUrl ?? null;
  if (isStaff(user)) {
    const fallback = await pickStaffClient(activeClientRef(searchParams.client));
    clientId = fallback?.id ?? null;
    clientCompany = fallback?.company ?? "";
    clientLogoUrl = fallback?.logo_url ?? null;
  }

  const [messages, updates, peers, clientPeople] = await Promise.all([
    listMessages(clientId),
    listUpdates(clientId),
    listTeamPeers(),
    listClientUsers(clientId),
  ]);

  return (
    <ChatView
      initialMessages={messages}
      updates={updates}
      peers={peers}
      directory={[...peers, ...clientPeople]}
      currentUserId={user?.id ?? "demo"}
      currentName={user?.name ?? "You"}
      currentRole={user?.role ?? "client"}
      clientId={clientId}
      clientCompany={clientCompany}
      clientLogoUrl={clientLogoUrl}
    />
  );
}
