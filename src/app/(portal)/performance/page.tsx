import { getAuthUser } from "@/lib/auth";
import { getKpis, getSeries } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PerformanceView } from "./view";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const user = await getAuthUser();
  const isStaff = user?.role !== "client";

  let clients: { id: string; company: string }[] = [];
  if (isStaff) {
    const sb = createClient();
    if (sb) {
      const { data } = await sb.from("clients").select("id,company").order("company");
      clients = data ?? [];
    }
  }

  const clientId = isStaff ? (searchParams.client ?? clients[0]?.id ?? null) : (user?.client_id ?? null);

  const [kpis, series] = await Promise.all([getKpis(clientId), getSeries(clientId)]);
  return (
    <PerformanceView
      kpis={kpis}
      series={series}
      clients={clients}
      selectedClientId={clientId}
      isStaff={isStaff}
    />
  );
}
