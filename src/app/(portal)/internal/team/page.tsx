import { redirect } from "next/navigation";
import { getAuthUser, isStaff } from "@/lib/auth";
import { listInternalMessages, listTeamPeers } from "@/lib/data";
import { TeamChatView } from "./view";

export default async function TeamChatPage() {
  const user = await getAuthUser();
  if (!isStaff(user)) redirect("/dashboard");

  const [messages, allPeers] = await Promise.all([listInternalMessages(), listTeamPeers()]);
  // You can DM every colleague except yourself.
  const peers = allPeers.filter((p) => p.id !== user?.id);

  return (
    <TeamChatView
      initialMessages={messages}
      peers={peers}
      currentUserId={user?.id ?? "demo"}
      currentName={user?.name ?? "You"}
      currentRole={user?.role ?? "team"}
    />
  );
}
