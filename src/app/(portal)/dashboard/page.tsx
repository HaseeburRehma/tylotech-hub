import { getAuthUser } from "@/lib/auth";
import { getKpis, getSeries, listProjects, listUpdates } from "@/lib/data";
import { DashboardView } from "./view";

export default async function DashboardPage() {
  const user = await getAuthUser();
  const clientId = user?.client_id ?? null;

  const [kpis, projects, updates, series] = await Promise.all([
    getKpis(clientId),
    listProjects(clientId),
    listUpdates(clientId),
    getSeries(clientId),
  ]);

  return (
    <DashboardView
      kpis={kpis}
      projects={projects.slice(0, 5)}
      updates={updates.slice(0, 4)}
      series={series}
    />
  );
}
