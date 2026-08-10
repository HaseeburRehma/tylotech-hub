import { PageHeader } from "@/components/ui/page-header";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, isProviderLive } from "@/lib/integrations/providers";
import { IntegrationsBoard } from "./board";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const user = await getAuthUser();
  const supabase = createClient();
  const isStaff = user?.role !== "client";

  let clients: { id: string; company: string }[] = [];
  if (supabase && isStaff) {
    const { data } = await supabase.from("clients").select("id,company").order("company");
    clients = data ?? [];
  }

  const clientId = user?.role === "client" ? user.client_id : searchParams.client ?? clients[0]?.id ?? null;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Connect ad & analytics sources to pull live KPIs into the portal."
      />
      <IntegrationsBoard
        providers={PROVIDERS}
        rows={rows}
        clientId={clientId}
        clients={clients}
        isStaff={isStaff}
        liveProviders={PROVIDERS.filter(isProviderLive).map((p) => p.id)}
      />
    </div>
  );
}
