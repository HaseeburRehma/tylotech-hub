import { getAuthUser, isStaff } from "@/lib/auth";
import { listDocuments, pickStaffClient } from "@/lib/data";
import { activeClientRef } from "@/lib/active-client-server";
import { DocumentsView } from "./view";

export default async function DocumentsPage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();

  // Staff have no client_id of their own — scope to the client picked in the sidebar.
  let clientId = user?.client_id ?? null;
  if (isStaff(user)) {
    clientId = (await pickStaffClient(activeClientRef(searchParams.client)))?.id ?? null;
  }

  const documents = await listDocuments(clientId);
  return <DocumentsView documents={documents} clientId={clientId} />;
}
