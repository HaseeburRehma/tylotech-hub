import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { getClientByRef, listClients, listMessages, listTeamPeers, listUpdates } from "@/lib/data";
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
    const ref = activeClientRef(searchParams.client);
    const picked = ref ? await getClientByRef(ref) : null;
    const fallback = picked ?? [...(await listClients())].sort((a, b) => a.company.localeCompare(b.company))[0] ?? null;
    clientId = fallback?.id ?? null;
    clientCompany = fallback?.company ?? "";
    clientLogoUrl = fallback?.logo_url ?? null;
  }

  const [messages, updates, peers] = await Promise.all([listMessages(clientId), listUpdates(clientId), listTeamPeers()]);

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
      clientLogoUrl={clientLogoUrl}
    />
  );
}
