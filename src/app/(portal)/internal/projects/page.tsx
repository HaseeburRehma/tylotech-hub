import { listClients, listProjects, listTeamMembers } from "@/lib/data";
import { ProjectsManager } from "./manager";

export default async function ProjectsPage() {
  const [projects, clients, members] = await Promise.all([
    listProjects(),
    listClients(),
    listTeamMembers(),
  ]);

  return (
    <ProjectsManager
      projects={projects}
      clients={clients.map((c) => ({ id: c.id, company: c.company }))}
      members={members}
    />
  );
}
