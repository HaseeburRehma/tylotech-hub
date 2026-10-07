import { listClients } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { ActivityView, type AuditRow } from "./view";

const PAGE = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AREAS = new Set(["client", "team", "invite", "project", "update", "document", "report", "tool", "integration", "workflow"]);

/** Staff audit trail (who changed what). The internal layout already gates staff. */
export default async function ActivityPage({ searchParams }: { searchParams: { client?: string; area?: string; before?: string } }) {
  const sb = createClient();
  const clients = (await listClients({ includeArchived: true })).map((c) => ({ id: c.id, company: c.company }));
  const client = searchParams.client && UUID_RE.test(searchParams.client) ? searchParams.client : "";
  const area = searchParams.area && AREAS.has(searchParams.area) ? searchParams.area : "";
  const before = searchParams.before && !Number.isNaN(Date.parse(searchParams.before)) ? searchParams.before : "";

  let rows: AuditRow[] = [];
  let ready = true;
  if (sb) {
    let q = sb
      .from("audit_log")
      .select("id,actor_name,action,client_id,target_type,target_id,summary,created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);
    if (client) q = q.eq("client_id", client);
    if (area) q = q.like("action", `${area}.%`);
    if (before) q = q.lt("created_at", before);
    const { data, error } = await q;
    if (error) ready = false;
    rows = (data ?? []) as AuditRow[];
  }
  const hasMore = rows.length > PAGE;
  return (
    <ActivityView
      rows={rows.slice(0, PAGE)}
      hasMore={hasMore}
      clients={clients}
      filters={{ client, area, before }}
      ready={ready}
    />
  );
}
