import { listClientsEnriched, listTeamMembers } from "@/lib/data";
import { ClientsView } from "./view";

export default async function ClientsPage() {
  const [clients, team] = await Promise.all([
    listClientsEnriched(),
    listTeamMembers(),
  ]);

  return <ClientsView clients={clients} team={team} />;
}
