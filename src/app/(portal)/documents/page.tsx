import { getAuthUser, isStaff } from "@/lib/auth";
import { getClientByRef, listClients, listDocuments } from "@/lib/data";
import { activeClientRef } from "@/lib/active-client-server";
import { DocumentsView } from "./view";

export default async function DocumentsPage() {
  const user = await getAuthUser();

  // Staff have no client_id of their own — scope to the client picked in the sidebar.
  let clientId = user?.client_id ?? null;
  if (isStaff(user)) {
    const ref = activeClientRef();
    const picked = ref ? await getClientByRef(ref) : null;
    const [first] = (await listClients()).sort((a, b) => a.company.localeCompare(b.company));
    clientId = picked?.id ?? first?.id ?? null;
  }

  const documents = await listDocuments(clientId);
  return <DocumentsView documents={documents} clientId={clientId} />;
}
