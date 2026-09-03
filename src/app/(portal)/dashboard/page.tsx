import { getAuthUser } from "@/lib/auth";
import {
  getKpis,
  getSeries,
  getPortfolioSummary,
  listClients,
  listIntegrationHealth,
  listProjects,
  listUpdates,
  listUpdatesAll,
} from "@/lib/data";
import { PROVIDERS } from "@/lib/integrations/providers";
import { ClientDashboardView, StaffDashboardView } from "./view";

export default async function DashboardPage() {
  const user = await getAuthUser();

  if (!user || user.role === "client") {
    const clientId = user?.client_id ?? null;
    const [kpis, projects, updates, series] = await Promise.all([
      getKpis(clientId),
      listProjects(clientId),
      listUpdates(clientId),
      getSeries(clientId),
    ]);

    return (
      <ClientDashboardView
        kpis={kpis}
        projects={projects.slice(0, 5)}
        updates={updates.slice(0, 4)}
        series={series}
      />
    );
  }

  // Staff/admin: no single client_id to scope to — this is a cross-tenant
  // workspace snapshot, deliberately distinct from /internal (agency revenue,
  // team utilization, full pipeline) and /performance (one client's deep dive).
  const [portfolio, attention, allProjects, updates, clients] = await Promise.all([
    getPortfolioSummary(),
    listIntegrationHealth(),
    listProjects(),
    listUpdatesAll(8),
    listClients(),
  ]);

  const companyById = new Map(clients.map((c) => [c.id, c.company]));
  const myProjects = allProjects
    .filter((p) => p.assigned_to_id === user.id)
    .slice(0, 6)
    .map((p) => ({ ...p, clientName: companyById.get(p.client_id) ?? "—" }));
  const myActiveTasks = allProjects.filter(
    (p) => p.assigned_to_id === user.id && (p.status === "in_progress" || p.status === "review"),
  ).length;

  const attentionRows = attention.map((r) => ({
    ...r,
    providerLabel: PROVIDERS.find((p) => p.id === r.provider)?.name ?? r.provider,
  }));

  return (
    <StaffDashboardView
      portfolio={portfolio}
      attention={attentionRows}
      myProjects={myProjects}
      myActiveTasks={myActiveTasks}
      updates={updates}
    />
  );
}
