import { NextResponse } from "next/server";
import { missingApprovals } from "@/lib/approvals";
import { logAudit } from "@/lib/audit";
import { notifyClientUsers } from "@/lib/notify";
import { UUID_RE, bad, staffContext } from "../../../_shared";

export const runtime = "nodejs";

const NOT_READY = "Client approvals need database migration 0042 — ask an admin to run it.";

/**
 * Ask the partner to approve a draft on this step (any team member):
 * { title?, message?, attachmentIds: string[] } — the attachments must belong
 * to the step. An earlier pending request on the same step is withdrawn.
 * The partner's people get an in-app + push + email notification.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid step id.");
  const b = (await req.json().catch(() => null)) as { title?: string; message?: string; attachmentIds?: unknown } | null;
  if (!b) return bad("Invalid request.");

  const { data: step } = await ctx.admin
    .from("workflow_run_steps")
    .select("id,run_id,title,workflow_runs(name,client_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!step) return bad("Step not found.", 404);
  const run = (Array.isArray(step.workflow_runs) ? step.workflow_runs[0] : step.workflow_runs) as { name: string; client_id: string | null } | null;
  if (!run?.client_id) return bad("This process has no partner to ask.");

  const ids = Array.from(new Set((Array.isArray(b.attachmentIds) ? b.attachmentIds : []).map(String))).slice(0, 20);
  if (!ids.every((x) => UUID_RE.test(x))) return bad("Invalid attachments.");
  if (ids.length) {
    const { data: atts } = await ctx.admin.from("workflow_step_attachments").select("id").eq("step_id", step.id).in("id", ids);
    if ((atts ?? []).length !== ids.length) return bad("Pick files from this step.");
  }
  const title = String(b.title ?? "").trim().slice(0, 200) || step.title;
  const message = String(b.message ?? "").trim().slice(0, 2000) || null;
  if (!ids.length && !message) return bad("Add a file, link or a short description of what to approve.");

  const withdraw = await ctx.admin.from("workflow_approvals").update({ status: "cancelled" }).eq("step_id", step.id).eq("status", "pending");
  if (withdraw.error && missingApprovals(withdraw.error.message)) return bad(NOT_READY, 503);

  const { data: approval, error } = await ctx.admin
    .from("workflow_approvals")
    .insert({ run_id: step.run_id, step_id: step.id, client_id: run.client_id, title, message, attachment_ids: ids, requested_by: ctx.user.id })
    .select("*")
    .single();
  if (error || !approval) {
    if (missingApprovals(error?.message)) return bad(NOT_READY, 503);
    return bad("Could not create the approval request.");
  }

  await notifyClientUsers(run.client_id, {
    title: `Freigabe angefragt: ${title}`,
    body: message ?? `${ids.length} Datei(en) zur Freigabe`,
    href: "/approvals",
    type: "approval",
  }).catch(() => {});
  await logAudit(ctx.user, { action: "approval.request", clientId: run.client_id, targetType: "workflow_step", targetId: step.id, summary: `${run.name} · ${title}` }, ctx.admin);
  return NextResponse.json({ ok: true, approval });
}
