import { getAuthUser, isStaff } from "@/lib/auth";
import { listProjects, pickStaffClient } from "@/lib/data";
import { activeClientRef } from "@/lib/active-client-server";
import { ProjectsView } from "./view";

export default async function ProjectsPage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();

  // Staff have no client_id of their own — scope to the client picked in the sidebar.
  let clientId = user?.client_id ?? null;
  if (isStaff(user)) {
    clientId = (await pickStaffClient(activeClientRef(searchParams.client)))?.id ?? null;
  }

  const projects = clientId ? await listProjects(clientId) : [];
  return <ProjectsView projects={projects} staff={isStaff(user)} />;
}
