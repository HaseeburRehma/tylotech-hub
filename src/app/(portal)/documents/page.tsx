import { getAuthUser } from "@/lib/auth";
import { listDocuments } from "@/lib/data";
import { DocumentsView } from "./view";

export default async function DocumentsPage() {
  const user = await getAuthUser();
  const documents = await listDocuments(user?.client_id ?? null);
  return <DocumentsView documents={documents} clientId={user?.client_id ?? null} />;
}
