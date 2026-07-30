import { listAiTools } from "@/lib/data";
import { AiToolsEditor } from "./editor";

export default async function InternalAiToolsPage() {
  const tools = await listAiTools();
  return <AiToolsEditor tools={tools} />;
}
