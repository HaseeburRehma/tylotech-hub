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

  return <InternalView clients={clients} team={team} pipeline={pipeline} />;
}
