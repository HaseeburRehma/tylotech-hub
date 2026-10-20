import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { getClientByRef, listClients } from "@/lib/data";
import { hookUrl, leadPeople, missingLeads, type Lead, type LeadSourceView } from "@/lib/leads";
import { metaApp, metaWebhookVerifyToken } from "@/lib/leads-meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { LeadsView } from "@/components/leads/leads-view";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: { client?: string } }) {
  const user = await getAuthUser();
  const staff = isStaff(user);
  // Staff work on the partner picked in the sidebar; clients on their own company.
  let clientId = user?.client_id ?? null;
  let company = user?.company ?? "";
  if (staff) {
    const ref = activeClientRef(searchParams.client);
    const picked = ref ? await getClientByRef(ref) : null;
    const [first] = (await listClients()).sort((a, b) => a.company.localeCompare(b.company));
    const c = picked ?? first ?? null;
    clientId = c?.id ?? null;
    company = c?.company ?? "";
  }
  const admin = createAdminClient();
  if (!admin || !clientId || !user) return <LeadsView unavailable leads={[]} people={[]} sources={[]} clientId={null} company="" staff={staff} metaReady={false} webhook={null} />;

  const [leadsRes, people, sourcesRes] = await Promise.all([
    admin.from("leads").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(2000),
    leadPeople(admin, clientId),
    admin.from("lead_sources").select("*").eq("client_id", clientId).order("created_at"),
  ]);
  const unavailable = !!leadsRes.error && missingLeads(leadsRes.error.message);
  const h = headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const sources: LeadSourceView[] = ((sourcesRes.data ?? []) as any[]).map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    status: s.status,
    last_error: s.last_error,
    last_received_at: s.last_received_at,
    last_synced_at: s.last_synced_at,
    created_at: s.created_at,
    hookUrl: s.kind === "meta" ? null : hookUrl(origin, s.id),
    key: s.kind === "meta" ? null : s.secret,
  }));

  return (
    <LeadsView
      unavailable={unavailable}
      leads={(leadsRes.data ?? []) as Lead[]}
      // Clients assign among their own people; the team also sees TyloTech staff.
      people={staff ? people : people.filter((p) => p.role === "client")}
      sources={sources}
      clientId={clientId}
      company={company}
      staff={staff}
      metaReady={!!metaApp()}
      webhook={staff ? { url: `${origin}/api/leads/meta/webhook`, verifyToken: metaWebhookVerifyToken() } : null}
    />
  );
}
