import { getAuthUser, isStaff as isStaffRole } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { getClientByRef, getSearchPages, getSeriesByProvider, listClients } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS } from "@/lib/integrations/providers";
import { PerformanceView, type SourceStatus } from "./view";

export default async function PerformancePage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();
  const isStaff = isStaffRole(user);

  // Staff: one client (slug or legacy UUID, else the sidebar's pick) or the whole
  // portfolio with ?client=all. Clients always see their own tenant.
  const clients = isStaff ? (await listClients()).sort((a, b) => a.company.localeCompare(b.company)) : [];
  let selected: string | null = user?.client_id ?? null;
  if (isStaff) {
    if (searchParams.client === "all") selected = "all";
    else {
      const ref = activeClientRef(searchParams.client);
      const picked = ref ? await getClientByRef(ref) : null;
      selected = picked?.id ?? clients[0]?.id ?? null;
    }
  }

  const [series, pages] = await Promise.all([getSeriesByProvider(selected), getSearchPages(selected)]);

  // Per-source sync status for the status line ("Search Console zuletzt
  // synchronisiert …"). integrations SELECT is revoked from browser roles, so
  // read it server-side. For the portfolio: the newest sync of each source.
  const sourceStatus: Record<string, SourceStatus> = {};
  let siteHost: string | null = null;
  const admin = createAdminClient();
  if (admin && selected) {
    let q = admin.from("integrations").select("client_id,provider,status,last_synced_at,meta");
    if (selected !== "all") q = q.eq("client_id", selected);
    const { data: rows } = await q;
    for (const row of rows ?? []) {
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
