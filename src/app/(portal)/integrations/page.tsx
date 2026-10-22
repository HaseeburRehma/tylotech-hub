import { PageHeader } from "@/components/ui/page-header";
import { getAuthUser } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientByRef } from "@/lib/data";
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

  let clients: { id: string; company: string; slug: string | null }[] = [];
  if (supabase && isStaff) {
    const { data } = await supabase.from("clients").select("*").order("company");
    clients = (data ?? []).filter((c: any) => !c.archived_at).map((c: any) => ({ id: c.id, company: c.company, slug: c.slug ?? null }));
  }

  // searchParams.client may be a slug (clean links) or a legacy UUID — resolve
  // it the same way the rest of the app does, so both keep working.
  const ref = isStaff ? activeClientRef(searchParams.client) : null;
  const requestedClient = ref ? await getClientByRef(ref) : null;
  const clientId =
    user?.role === "client" ? user.client_id : requestedClient?.id ?? clients[0]?.id ?? null;

  let rows: any[] = [];
  const admin = createAdminClient();
  if (admin && clientId) {
    // Read via the service role (integrations SELECT is revoked from the browser
    // role). clientId is the caller's own tenant (client) or the staff-selected
    // one, so this is tenant-safe. Strip tokens — expose only a has_token boolean.
    const { data } = await admin.from("integrations").select("*").eq("client_id", clientId);
    rows = (data ?? []).map(({ access_token, refresh_token, ...r }: any) => ({
      ...r,
      has_token: !!access_token,
    }));
  }

  // Staff overview: which source feeds which client (status only — no tokens or
  // account ids leave the server).
  let matrix: { client_id: string; provider: string; status: string }[] = [];
  if (admin && isStaff && clients.length) {
    const { data } = await admin
      .from("integrations")
      .select("client_id,provider,status")
      .in("client_id", clients.map((c) => c.id));
    matrix = (data ?? []) as typeof matrix;
  }

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
