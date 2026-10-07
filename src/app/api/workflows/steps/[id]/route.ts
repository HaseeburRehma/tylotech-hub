import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { notifyRunCompleted, notifyStepActive } from "@/lib/workflows";
import { DATE_RE, UUID_RE, bad, engineError, staffContext } from "../../_shared";

export const runtime = "nodejs";

/**
 * One endpoint per step:
 *  - { action: "complete" }  assignee or admin; auto-advances (engine)
 *  - { action: "skip" }      admin; still advances
 *  - { action: "reopen" }    admin; re-locks the steps after it
 *  - { assigneeUserId }      any team member, any state (notifies if active)
 *  - { dueDate, note }       any team member, any state
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid step id.");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");

  const { data: step } = await ctx.admin
    .from("workflow_run_steps")
    .select("id,run_id,title,status,assignee_user_id,workflow_runs(name,client_id,status)")
    .eq("id", params.id)
    .maybeSingle();
  if (!step) return bad("Step not found.", 404);
  const run = (Array.isArray(step.workflow_runs) ? step.workflow_runs[0] : step.workflow_runs) as { name: string; client_id: string | null; status: string } | null;
  const isAdmin = ctx.user.role === "admin";
  const audit = (action: string, summary: string) =>
    logAudit(ctx.user, { action, clientId: run?.client_id ?? null, targetType: "workflow_step", targetId: step.id, summary: `${run?.name ?? ""} · ${summary}` }, ctx.admin);

  if (b.action === "complete" || b.action === "skip") {
    if (b.action === "skip" && !isAdmin) return bad("Only admins can skip steps.", 403);
    if (b.action === "complete" && step.assignee_user_id !== ctx.user.id && !isAdmin) {
      return bad(step.assignee_user_id ? "Only the responsible person (or an admin) can check off this step." : "Assign this step first.", 403);
    }
    if (run?.status === "paused") return bad("This process is paused.", 409);
    const { data, error } = await ctx.admin.rpc("workflow_advance", { p_step: step.id, p_actor: ctx.user.id, p_status: b.action === "skip" ? "skipped" : "done" });
    if (error) return engineError(error.message);
    const result = (Array.isArray(data) ? data[0] : data) as { next_step_id: string | null; run_completed: boolean } | null;
    if (result?.next_step_id) await notifyStepActive(ctx.admin, result.next_step_id, ctx.user.id).catch(() => {});
    if (result?.run_completed) await notifyRunCompleted(ctx.admin, step.run_id, ctx.user.id).catch(() => {});
    await audit(b.action === "skip" ? "workflow.step_skip" : "workflow.step_done", step.title);
    return NextResponse.json({ ok: true, nextStepId: result?.next_step_id ?? null, runCompleted: !!result?.run_completed });
  }

  if (b.action === "reopen") {
    if (!isAdmin) return bad("Only admins can reopen steps.", 403);
    const { error } = await ctx.admin.rpc("workflow_reopen", { p_step: step.id });
    if (error) return engineError(error.message);
    await audit("workflow.step_reopen", step.title);
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if (b.assigneeUserId !== undefined) {
    const id = b.assigneeUserId === null || b.assigneeUserId === "" ? null : String(b.assigneeUserId);
    if (id) {
      const { data: u } = await ctx.admin.from("users").select("*").eq("id", id).maybeSingle();
      if (!u || !["admin", "team"].includes(u.role) || u.deactivated_at) return bad("Pick an active team member.");
    }
    patch.assignee_user_id = id;
  }
  if (b.dueDate !== undefined) {
    const d = b.dueDate === null || b.dueDate === "" ? null : String(b.dueDate);
    if (d && !DATE_RE.test(d)) return bad("Deadline must be YYYY-MM-DD.");
    patch.due_date = d;
  }
  if (b.note !== undefined) patch.note = String(b.note ?? "").trim().slice(0, 2000) || null;
  if (!Object.keys(patch).length) return bad("Nothing to update.");

  const { error } = await ctx.admin.from("workflow_run_steps").update(patch).eq("id", step.id);
  if (error) return bad(error.message);

  const reassigned = "assignee_user_id" in patch && patch.assignee_user_id !== step.assignee_user_id;
  if (reassigned && step.status === "active" && patch.assignee_user_id && patch.assignee_user_id !== ctx.user.id) {
    await notifyStepActive(ctx.admin, step.id).catch(() => {});
  }
  await audit(reassigned ? "workflow.step_assign" : "workflow.step_edit", `${step.title}: ${Object.keys(patch).join(", ")}`);
  return NextResponse.json({ ok: true });
}
