import { PageHeader } from "@/components/ui/page-header";
import { listClients, listProjects, listTeamMembers } from "@/lib/data";
import { ProjectsManager } from "./manager";

export default async function ProjectsPage() {
  const [projects, clients, members] = await Promise.all([
    listProjects(),
    listClients(),
    listTeamMembers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Create projects, track progress and assign them to your team."
      />
      <ProjectsManager
        projects={projects}
        clients={clients.map((c) => ({ id: c.id, company: c.company }))}
        members={members}
      />
    </div>
  );
}
