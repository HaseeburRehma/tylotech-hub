import { getAuthUser } from "@/lib/auth";
import { getKpis, getSeries } from "@/lib/data";
import { PerformanceView } from "./view";

export default async function PerformancePage() {
  const user = await getAuthUser();
  const clientId = user?.client_id ?? null;
  const [kpis, series] = await Promise.all([getKpis(clientId), getSeries(clientId)]);
  return <PerformanceView kpis={kpis} series={series} />;
}
