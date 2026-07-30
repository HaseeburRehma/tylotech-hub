import { PageHeader } from "@/components/ui/page-header";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  if (supabase && clientId) {
    const { data } = await supabase.from("integrations").select("*").eq("client_id", clientId);
    // Never send raw access tokens to the browser — expose only whether one is set.
    rows = (data ?? []).map(({ access_token, ...r }: any) => ({ ...r, has_token: !!access_token }));
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
