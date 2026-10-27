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
  isDemoClient,
} from "@/lib/data";
import { PROVIDERS } from "@/lib/integrations/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientDashboardView, StaffDashboardView } from "./view";

export default async function DashboardPage() {
  const user = await getAuthUser();

  if (!user || user.role === "client") {
    const clientId = user?.client_id ?? null;
    const admin = createAdminClient();
    const [kpis, projects, updates, series, integ] = await Promise.all([
      getKpis(clientId),
      listProjects(clientId),
      listUpdates(clientId),
      getSeries(clientId),
      admin && clientId
        ? admin.from("integrations").select("status").eq("client_id", clientId)
        : Promise.resolve({ data: [] as { status: string }[] }),
    ]);
    const connectedSources = (integ.data ?? []).filter((r: { status: string }) => r.status === "connected").length;

    // No ad data? Chart what the client does have: GA4 sessions/users, else
    // Search Console clicks — instead of an empty "connect an ad source" box.
    let chart: { kind: "ads" | "ga4" | "seo"; series: typeof series } = { kind: "ads", series };
    if (!series.length && clientId) {
      const ga4 = await getSeries(clientId, "ga4");
      if (ga4.length) chart = { kind: "ga4", series: ga4.slice(-30) };
      else {
        const seo = await getSeries(clientId, "search_console");
        if (seo.length) chart = { kind: "seo", series: seo.slice(-30) };
      }
    }

    return (
      <ClientDashboardView
        kpis={kpis}
        projects={projects.slice(0, 5)}
        updates={updates.slice(0, 4)}
        series={chart.series}
        seriesKind={chart.kind}
        connectedSources={connectedSources}
        totalSources={PROVIDERS.length}
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

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const companyById = new Map(clients.map((c) => [c.id, c.company]));
  const myProjects = allProjects
    .filter((p) => p.assigned_to_id === user.id)
    .slice(0, 6)
    .map((p) => ({ ...p, clientName: companyById.get(p.client_id) ?? "-" }));
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
      activeClients={clients.filter((c) => !isDemoClient(c)).length}
      newClientsThisMonth={clients.filter((c) => !isDemoClient(c) && c.created_at && new Date(c.created_at) >= monthStart).length}
    />
  );
}
