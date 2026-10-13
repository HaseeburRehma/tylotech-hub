import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { berlinToday, listStaff, loadTemplates, notifyStepActive, resolveDefaultAssignee } from "@/lib/workflows";
import { UUID_RE, bad, staffContext } from "../_shared";

export const runtime = "nodejs";

/**
 * Start runs: { templateId, clientId | clientIds[], name?, assignees?: { [templateStepId]: userId | null } }.
 * One run per partner: copies the template's steps, activates step 1 (with its
 * deadline) and notifies its assignee. Assignees default from the template roles.
 * A batch sends each assignee one email (in-app/push still per run).
 */
const MAX_BATCH = 50;
// Runs already started in this batch stay (each is a valid run); report them.
const partialFail = (msg: string | undefined, ids: string[]) =>
  NextResponse.json({ error: msg ?? "Could not start the process.", ids }, { status: 400 });

export async function POST(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");
  const templateId = String(b.templateId ?? "");
  const clientIds = Array.from(
    new Set((Array.isArray(b.clientIds) ? b.clientIds : [b.clientId]).map((x) => String(x ?? ""))),
  );
  if (!UUID_RE.test(templateId) || !clientIds.length || !clientIds.every((id) => UUID_RE.test(id))) {
    return bad("Template and partner are required.");
  }
  if (clientIds.length > MAX_BATCH) return bad(`At most ${MAX_BATCH} partners at once.`);

  const [templates, staff, { data: clientRows }] = await Promise.all([
    loadTemplates(ctx.admin),
    listStaff(ctx.admin),
    ctx.admin.from("clients").select("id,company,archived_at").in("id", clientIds),
  ]);
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) return bad("Template not found (or archived).", 404);
  const clients = clientIds.map((id) => (clientRows ?? []).find((c) => c.id === id));
  if (clients.some((c) => !c || c.archived_at)) return bad("Partner not found.", 404);
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

  // Deadlines count in Berlin calendar days (same as workflow_today() in the DB).
  const [ty, tm, td] = berlinToday().split("-").map(Number);
  const dueFrom = (offset: number | null) => {
    if (offset == null) return null;
    return new Date(Date.UTC(ty!, tm! - 1, td! + offset)).toISOString().slice(0, 10);
  };

  const ids: string[] = [];
  const emailed = new Set<string>();
  for (const client of clients as { id: string; company: string }[]) {
    const { data: run, error } = await ctx.admin
      .from("workflow_runs")
      .insert({ template_id: tpl.id, name, context_type: "partner", context_id: client.id, client_id: client.id, started_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !run) return partialFail(error?.message, ids);

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
      return partialFail(sErr?.message, ids);
    }
    ids.push(run.id);

    const first = inserted.find((s) => s.order_index === 0);
    const firstAssignee = rows[0]?.assignee_user_id ?? null;
    if (first) {
      const sendEmail = !firstAssignee || !emailed.has(firstAssignee);
      if (firstAssignee) emailed.add(firstAssignee);
      await notifyStepActive(ctx.admin, first.id, ctx.user.id, { email: sendEmail }).catch(() => {});
    }
    await logAudit(ctx.user, { action: "workflow.start", clientId: client.id, targetType: "workflow_run", targetId: run.id, summary: `${name} · ${client.company}` }, ctx.admin);
  }
  return NextResponse.json({ ok: true, id: ids[0], ids });
}
