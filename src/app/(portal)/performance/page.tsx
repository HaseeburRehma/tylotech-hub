import { getAuthUser } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { getKpis, getSeriesByProvider, getClientByRef } from "@/lib/data";
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

  let clients: { id: string; company: string; slug: string | null }[] = [];
  if (isStaff) {
    const sb = createClient();
    if (sb) {
      const { data } = await sb.from("clients").select("*").order("company");
      clients = (data ?? []).filter((c: any) => !c.archived_at).map((c: any) => ({ id: c.id, company: c.company, slug: c.slug ?? null }));
    }
  }

  // searchParams.client may be a slug (clean links) or a legacy UUID.
  const ref = isStaff ? activeClientRef(searchParams.client) : null;
  const requestedClient = ref ? await getClientByRef(ref) : null;
  const clientId = isStaff ? (requestedClient?.id ?? clients[0]?.id ?? null) : (user?.client_id ?? null);

  const [kpis, series] = await Promise.all([getKpis(clientId), getSeriesByProvider(clientId)]);

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
      providers={PROVIDERS}
    />
  );
}
