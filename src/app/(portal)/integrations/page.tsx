import { PageHeader } from "@/components/ui/page-header";
import { getAuthUser } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listClients, pickStaffClient } from "@/lib/data";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { translate } from "@/lib/i18n/dictionary";
import { serverLocale } from "@/lib/i18n/server";
import { IntegrationsBoard } from "./board";
import { ConnectionsMatrix } from "./matrix";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const user = await getAuthUser();
  const supabase = createClient();
  const isStaff = user?.role !== "client";
  const locale = serverLocale();

  // searchParams.client may be a slug (clean links) or a legacy UUID — resolve
  // it the same way the rest of the app does, so both keep working.
  const [list, picked] =
    supabase && isStaff
      ? await Promise.all([
          listClients().then((all) => [...all].sort((a, b) => a.company.localeCompare(b.company))),
          pickStaffClient(activeClientRef(searchParams.client)),
        ])
      : [[], null];
  const clients = list.map((c) => ({ id: c.id, company: c.company, slug: c.slug ?? null }));
  const clientId = user?.role === "client" ? user.client_id : picked?.id ?? null;

  // Read via the service role (integrations SELECT is revoked from the browser
  // role). clientId is the caller's own tenant (client) or the staff-selected
  // one, so this is tenant-safe. Strip tokens — expose only a has_token boolean.
  // The staff overview (which source feeds which client: status only, no tokens
  // or account ids leave the server) loads at the same time.
  const admin = createAdminClient();
  const [own, overview] = await Promise.all([
    admin && clientId ? admin.from("integrations").select("*").eq("client_id", clientId) : null,
    admin && isStaff && clients.length
      ? admin.from("integrations").select("client_id,provider,status").in("client_id", clients.map((c) => c.id))
      : null,
  ]);
  const rows: any[] = (own?.data ?? []).map(({ access_token, refresh_token, ...r }: any) => ({
    ...r,
    has_token: !!access_token,
  }));
  const matrix = (overview?.data ?? []) as { client_id: string; provider: string; status: string }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={translate(locale, "integrations.title")}
        subtitle={translate(locale, "integrations.subtitle")}
      />
      <IntegrationsBoard
        providers={PROVIDERS}
        rows={rows}
        clientId={clientId}
        clients={clients}
        isStaff={isStaff}
        liveProviders={PROVIDERS.filter(isProviderLive).map((p) => p.id)}
      />
      {isStaff && clients.length > 0 && (
        <ConnectionsMatrix
          clients={clients}
          providers={PROVIDERS.map((p) => ({ id: p.id, name: p.name }))}
          rows={matrix}
          activeClientId={clientId}
        />
      )}
    </div>
  );
}
