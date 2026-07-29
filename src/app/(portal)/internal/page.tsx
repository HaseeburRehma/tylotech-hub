import { listClients, listProjects, listTeamLoad } from "@/lib/data";
import { InternalView, type PipelineColumn } from "./view";
import type { ProjectStatus } from "@/types";

const STAGES: { key: ProjectStatus; label: string }[] = [
  { key: "planning", label: "Planning" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export default async function InternalPage() {
  const [clients, team, projects] = await Promise.all([
    listClients(),
    listTeamLoad(),
    listProjects(),
  ]);

  const companyById = Object.fromEntries(clients.map((c) => [c.id, c.company]));

  const pipeline: PipelineColumn[] = STAGES.map((s) => ({
    stage: s.label,
    projects: projects
      .filter((p) => p.status === s.key)
      .map((p) => ({ name: p.name, client: companyById[p.client_id] ?? "—" })),
  }));

  // Real MRR history: cumulative MRR of clients onboarded on/before each month.
  const now = new Date();
  const mrrSeries = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 0); // end of that month
    const mrr = clients
      .filter((c) => new Date(c.created_at) <= d)
      .reduce((a, c) => a + (c.mrr ?? 0), 0);
    return { month: d.toLocaleDateString("en", { month: "short" }), mrr };
  });

  return (
    <InternalView
      clients={clients}
      team={team}
      pipeline={pipeline}
      mrrSeries={mrrSeries}
      projectCount={projects.length}
    />
  );
}
