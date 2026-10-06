import { listClientHealth, listClientsEnriched, listTeamMembers } from "@/lib/data";
import { ClientsView } from "./view";

export default async function ClientsPage() {
  const [clients, team, health] = await Promise.all([listClientsEnriched(), listTeamMembers(), listClientHealth()]);
  return <ClientsView clients={clients} team={team} health={health} />;
}
