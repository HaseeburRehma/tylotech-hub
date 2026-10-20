import type { SupabaseClient } from "@supabase/supabase-js";
import type { Approval } from "@/lib/workflows-shared";

export const missingApprovals = (msg: string | undefined) => /workflow_approvals|schema cache|does not exist/i.test(msg ?? "");

/**
 * Approvals with what the client may see of them: the chosen files/links (by
 * name; files open through /api/approvals/:id/files/:attId), who asked and
 * who decided, and the step / process names. Runs with the service role —
 * callers must already have scoped `filter` to what the user may see.
 */
export async function loadApprovals(
  admin: SupabaseClient,
  filter: { clientId?: string; ids?: string[]; status?: string[]; limit?: number },
): Promise<{ data: Approval[]; error: string | null }> {
  let q = admin
    .from("workflow_approvals")
    .select("*, workflow_run_steps(title), workflow_runs(name)")
    .order("requested_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.ids) q = q.in("id", filter.ids.length ? filter.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (filter.status?.length) q = q.in("status", filter.status);
  const { data, error } = await q;
  if (error) return { data: [], error: error.message };
  const rows = (data ?? []) as any[];

  const attIds = Array.from(new Set(rows.flatMap((r) => (r.attachment_ids ?? []) as string[])));
  const userIds = Array.from(new Set(rows.flatMap((r) => [r.requested_by, r.decided_by]).filter(Boolean)));
  const [atts, users] = await Promise.all([
    attIds.length ? admin.from("workflow_step_attachments").select("id,name,kind,mime,url").in("id", attIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? admin.from("users").select("id,name").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const attById = new Map(((atts.data ?? []) as any[]).map((a) => [a.id, a]));
  const nameById = new Map(((users.data ?? []) as any[]).map((u) => [u.id, u.name as string]));
  const one = (x: any) => (Array.isArray(x) ? x[0] : x);

  return {
    error: null,
    data: rows.map(({ workflow_run_steps, workflow_runs, ...r }) => ({
      ...r,
      step_title: one(workflow_run_steps)?.title ?? null,
      run_name: one(workflow_runs)?.name ?? null,
      requested_by_name: r.requested_by ? nameById.get(r.requested_by) ?? null : null,
      decided_by_name: r.decided_by ? nameById.get(r.decided_by) ?? null : null,
      files: ((r.attachment_ids ?? []) as string[])
        .map((id) => attById.get(id))
        .filter(Boolean)
        .map((a: any) => ({ id: a.id, name: a.name, kind: a.kind, mime: a.mime, url: a.kind === "link" ? a.url : null })),
    })) as Approval[],
  };
}
