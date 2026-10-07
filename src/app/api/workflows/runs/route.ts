import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { listStaff, loadTemplates, notifyStepActive, resolveDefaultAssignee } from "@/lib/workflows";
import { UUID_RE, bad, staffContext } from "../_shared";

export const runtime = "nodejs";

/**
 * Start a run: { templateId, clientId, name?, assignees?: { [templateStepId]: userId | null } }.
 * Copies the template's steps, activates step 1 (with its deadline) and
 * notifies its assignee. Assignees default from the template roles.
 */
export async function POST(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");
  const templateId = String(b.templateId ?? "");
  const clientId = String(b.clientId ?? "");
  if (!UUID_RE.test(templateId) || !UUID_RE.test(clientId)) return bad("Template and partner are required.");

  const [templates, staff, { data: client }] = await Promise.all([
    loadTemplates(ctx.admin),
    listStaff(ctx.admin),
    ctx.admin.from("clients").select("id,company,archived_at").eq("id", clientId).maybeSingle(),
  ]);
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) return bad("Template not found (or archived).", 404);
  if (!client || client.archived_at) return bad("Partner not found.", 404);
  if (!tpl.steps.length) return bad("This template has no steps.");

  const overrides = (b.assignees ?? {}) as Record<string, unknown>;
  const staffIds = new Set(staff.map((s) => s.id));
  const assigneeFor = (stepId: string | undefined, fallback: string | null) => {
    if (stepId && stepId in overrides) {
      const v = overrides[stepId];
      return typeof v === "string" && staffIds.has(v) ? v : null;
    }
    return fallback;
  };

  const name = String(b.name ?? "").trim().slice(0, 160) || tpl.name;
  const { data: run, error } = await ctx.admin
    .from("workflow_runs")
    .insert({ template_id: tpl.id, name, context_type: "partner", context_id: client.id, client_id: client.id, started_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !run) return bad(error?.message ?? "Could not start the process.");

  const today = new Date();
  const dueFrom = (offset: number | null) => {
    if (offset == null) return null;
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
    return d.toISOString().slice(0, 10);
  };
  const rows = tpl.steps.map((s, i) => ({
    run_id: run.id,
    template_step_id: s.id ?? null,
    order_index: i,
    title: s.title,
    instructions: s.instructions,
    assignee_user_id: assigneeFor(s.id, resolveDefaultAssignee(s, staff)),
    status: i === 0 ? "active" : "locked",
    due_offset_days: s.due_offset_days,
    due_date: i === 0 ? dueFrom(s.due_offset_days) : null,
    activated_at: i === 0 ? new Date().toISOString() : null,
  }));
  const { data: inserted, error: sErr } = await ctx.admin.from("workflow_run_steps").insert(rows).select("id,order_index");
  if (sErr || !inserted) {
    await ctx.admin.from("workflow_runs").delete().eq("id", run.id);
    return bad(sErr?.message ?? "Could not start the process.");
  }

  const first = inserted.find((s) => s.order_index === 0);
  if (first) await notifyStepActive(ctx.admin, first.id, ctx.user.id).catch(() => {});
  await logAudit(ctx.user, { action: "workflow.start", clientId: client.id, targetType: "workflow_run", targetId: run.id, summary: `${name} · ${client.company}` }, ctx.admin);
  return NextResponse.json({ ok: true, id: run.id });
}
