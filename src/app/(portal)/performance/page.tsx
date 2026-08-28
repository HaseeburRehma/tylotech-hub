import { getAuthUser } from "@/lib/auth";
import { getKpis, getSeries } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS } from "@/lib/integrations/providers";
import { PerformanceView, type SourceStatus } from "./view";

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

  // A metric's `source` (e.g. "Search Console") stays on a KPI/chart row after the
  // integration behind it goes stale — revoked token, manual disconnect, or simply
  // never re-synced. Cross-reference against the live integration rows (service-role
  // read; SELECT on integrations is revoked from the browser role) so the UI can flag
  // "last updated <date>, integration disconnected" instead of looking like live data.
  const sourceStatus: Record<string, SourceStatus> = {};
  const admin = createAdminClient();
  if (admin && clientId) {
    const { data: rows } = await admin
      .from("integrations")
      .select("provider,status,last_synced_at")
      .eq("client_id", clientId);
    for (const row of rows ?? []) {
      const provider = PROVIDERS.find((p) => p.id === row.provider);
      if (!provider) continue;
      sourceStatus[provider.name] = { connected: row.status === "connected", lastSyncedAt: row.last_synced_at };
    }
  }

  return (
    <PerformanceView
      kpis={kpis}
      series={series}
      clients={clients}
      selectedClientId={clientId}
      isStaff={isStaff}
      sourceStatus={sourceStatus}
    />
  );
}
