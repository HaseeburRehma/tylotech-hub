import { listClients, listProjects, listTeamMembers } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadRuns } from "@/lib/workflows";
import { ProjectsManager } from "./manager";

export default async function ProjectsPage() {
  const sb = createClient();
  const [projects, clients, members, runs] = await Promise.all([
    listProjects(),
    listClients(),
    listTeamMembers(),
    sb ? loadRuns(sb) : Promise.resolve([]),
  ]);

  const processCountByProject: Record<string, number> = {};
  for (const r of runs) {
    if (r.context_type === "project" && r.context_id) {
      processCountByProject[r.context_id] = (processCountByProject[r.context_id] ?? 0) + 1;
    }
  }

  return (
    <ProjectsManager
      projects={projects}
      clients={clients.map((c) => ({ id: c.id, company: c.company }))}
      members={members}
      processCountByProject={processCountByProject}
    />
  );
}
