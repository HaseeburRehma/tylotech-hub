import { listAiTools, listClients } from "@/lib/data";
import { AiToolsEditor } from "./editor";

export default async function InternalAiToolsPage() {
  const [tools, clients] = await Promise.all([listAiTools(), listClients()]);
  return <AiToolsEditor tools={tools} clientCount={clients.length} />;
}
