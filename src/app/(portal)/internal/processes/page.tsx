import { listClients } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listStaff, loadRuns, loadTemplates } from "@/lib/workflows";
import { ProcessesView } from "./view";

/** Central "Prozesse" area — board, my tasks, templates. Staff-gated by the internal layout. */
export default async function ProcessesPage({ searchParams }: { searchParams: { tab?: string } }) {
  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return null;
  const [runs, templates, staff, clients] = await Promise.all([
    loadRuns(sb),
    loadTemplates(sb, { includeArchived: true }),
    listStaff(admin),
    listClients(),
  ]);
  const tab = searchParams.tab === "mine" || searchParams.tab === "templates" ? searchParams.tab : "board";
  return (
    <ProcessesView
      tab={tab}
      runs={runs}
      templates={templates}
      staff={staff}
      clients={clients.map((c) => ({ id: c.id, company: c.company }))}
    />
  );
}
