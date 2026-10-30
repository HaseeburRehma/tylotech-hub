import { getAuthUser, isStaff as isStaffRole } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { getSearchPages, getSeriesByProvider, listClients, pickStaffClient } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS } from "@/lib/integrations/providers";
import { PerformanceView, type SourceStatus } from "./view";

export default async function PerformancePage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();
  const isStaff = isStaffRole(user);

  // Staff: one client (slug or legacy UUID, else the sidebar's pick) or the whole
  // portfolio with ?client=all. Clients always see their own tenant.
  const [clients, picked] = isStaff
    ? await Promise.all([
        listClients().then((list) => [...list].sort((a, b) => a.company.localeCompare(b.company))),
        searchParams.client === "all" ? null : pickStaffClient(activeClientRef(searchParams.client)),
      ])
    : [[], null];
  let selected: string | null = user?.client_id ?? null;
  if (isStaff) selected = searchParams.client === "all" ? "all" : picked?.id ?? null;

  // Per-source sync status for the status line ("Search Console zuletzt
  // synchronisiert …"). integrations SELECT is revoked from browser roles, so
  // read it server-side. For the portfolio: the newest sync of each source.
  const admin = createAdminClient();
  const integrationRows = async () => {
    if (!admin || !selected) return [];
    let q = admin.from("integrations").select("client_id,provider,status,last_synced_at,meta");
    if (selected !== "all") q = q.eq("client_id", selected);
    return (await q).data ?? [];
  };
  const [series, pages, rows] = await Promise.all([getSeriesByProvider(selected), getSearchPages(selected), integrationRows()]);

  const sourceStatus: Record<string, SourceStatus> = {};
  let siteHost: string | null = null;
  for (const row of rows) {
    if (!PROVIDERS.some((p) => p.id === row.provider)) continue;
    const prev = sourceStatus[row.provider];
    const connected = row.status === "connected" || !!prev?.connected;
    const lastSyncedAt = [prev?.lastSyncedAt, row.last_synced_at].filter(Boolean).sort().pop() ?? null;
    sourceStatus[row.provider] = { connected, lastSyncedAt };
    if (selected !== "all" && row.provider === "search_console") {
      const site = String((row.meta as { siteUrl?: string } | null)?.siteUrl ?? "");
      siteHost = site.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "") || null;
    }
  }

  const companyById = Object.fromEntries(clients.map((c) => [c.id, c.company]));
  return (
    <PerformanceView
      series={series}
      pages={pages.map((p) => ({ ...p, company: companyById[p.client_id] ?? null }))}
      clients={clients.map((c) => ({ id: c.id, company: c.company, slug: c.slug ?? null }))}
      selected={selected}
      isStaff={isStaff}
      sourceStatus={sourceStatus}
      siteHost={siteHost}
      providers={PROVIDERS.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
