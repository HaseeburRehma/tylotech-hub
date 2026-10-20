import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { notifyUser } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide on an approval:
 *  - client of that company: { decision: "approve" } or { decision: "changes", comment }
 *  - team: { decision: "cancel" } withdraws a pending request
 * Only pending requests can be decided. The requester and the step's
 * responsible person are notified; the decision shows on the process step.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { decision?: string; comment?: string } | null;
  const decision = b?.decision;
  const comment = String(b?.comment ?? "").trim().slice(0, 2000) || null;

  const { data: a } = await admin
    .from("workflow_approvals")
    .select("id,run_id,step_id,client_id,title,status,requested_by,workflow_run_steps(assignee_user_id,title),workflow_runs(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const staff = isStaff(user);
  if (decision === "cancel") {
    if (!staff) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  } else if (decision === "approve" || decision === "changes") {
    if (staff || user.client_id !== a.client_id) return NextResponse.json({ error: "Only the partner can approve." }, { status: 403 });
    if (decision === "changes" && !comment) return NextResponse.json({ error: "Please say what should change." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
  }

  const status = decision === "approve" ? "approved" : decision === "changes" ? "changes_requested" : "cancelled";
  const { data: updated, error } = await admin
    .from("workflow_approvals")
    .update({ status, decided_by: user.id, decided_at: new Date().toISOString(), decision_comment: decision === "cancel" ? null : comment })
    .eq("id", a.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the decision." }, { status: 400 });
  if (!updated) return NextResponse.json({ error: "This request was already answered or withdrawn." }, { status: 409 });

  if (decision !== "cancel") {
    const step = (Array.isArray(a.workflow_run_steps) ? a.workflow_run_steps[0] : a.workflow_run_steps) as { assignee_user_id: string | null; title: string } | null;
    const run = (Array.isArray(a.workflow_runs) ? a.workflow_runs[0] : a.workflow_runs) as { name: string } | null;
    const notify = Array.from(new Set([a.requested_by, step?.assignee_user_id].filter(Boolean) as string[]));
    for (const uid of notify) {
      await notifyUser(uid, {
        title: decision === "approve" ? `Freigegeben: ${a.title}` : `Änderungen gewünscht: ${a.title}`,
        body: `${user.name}${comment ? `: ${comment.slice(0, 140)}` : ""} · ${run?.name ?? ""}`,
        href: `/internal/processes/${a.run_id}`,
        type: "workflow",
      }).catch(() => {});
    }
  }
  await logAudit(
    user,
    { action: `approval.${status}`, clientId: a.client_id, targetType: "workflow_step", targetId: a.step_id, summary: `${a.title}${comment ? ` — ${comment.slice(0, 80)}` : ""}` },
    admin,
  );
  return NextResponse.json({ ok: true, approval: updated });
}
