import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { loadApprovals, missingApprovals } from "@/lib/approvals";
import { pickStaffClient } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApprovalsView } from "./view";

export default async function ApprovalsPage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();
  // Staff see the partner picked in the sidebar (read-only); clients their own company.
  let clientId = user?.client_id ?? null;
  if (isStaff(user)) {
    clientId = (await pickStaffClient(activeClientRef(searchParams.client)))?.id ?? null;
  }
  const admin = createAdminClient();
  const res = admin && clientId ? await loadApprovals(admin, { clientId }) : { data: [], error: null };
  const approvals = isStaff(user) ? res.data : res.data.filter((a) => a.status !== "cancelled");
  return <ApprovalsView approvals={approvals} unavailable={!!res.error && missingApprovals(res.error)} />;
}
