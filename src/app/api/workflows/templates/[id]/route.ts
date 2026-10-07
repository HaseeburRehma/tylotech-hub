import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { UUID_RE, bad, staffContext } from "../../_shared";
import { parseSteps } from "../parse";

export const runtime = "nodejs";

/**
 * Edit a template: name, description, archived and/or the full step list.
 * Running processes keep their own copy of the steps, so this never changes them.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid template id.");
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = String(b.name ?? "").trim();
    if (!name || name.length > 120) return bad("Name must be 1–120 characters.");
    patch.name = name;
  }
  if (b.description !== undefined) patch.description = String(b.description ?? "").trim().slice(0, 1000) || null;
  if (b.archived !== undefined) patch.archived = b.archived === true;

  let steps: ReturnType<typeof parseSteps> | null = null;
  if (b.steps !== undefined) {
    steps = parseSteps(b.steps);
    if ("error" in steps) return bad(steps.error);
  }
  if (!Object.keys(patch).length && !steps) return bad("Nothing to update.");

  const { data: tpl, error } = await ctx.admin
    .from("workflow_templates")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id,name")
    .maybeSingle();
  if (error) return bad(error.message);
  if (!tpl) return bad("Template not found.", 404);

  if (steps && "rows" in steps) {
    // Replace the definition (runs reference template steps with ON DELETE SET NULL).
    const { error: dErr } = await ctx.admin.from("workflow_template_steps").delete().eq("template_id", params.id);
    if (dErr) return bad(dErr.message);
    const { error: iErr } = await ctx.admin.from("workflow_template_steps").insert(steps.rows.map((s) => ({ ...s, template_id: params.id })));
    if (iErr) return bad(iErr.message);
  }

  const action = b.archived === true ? "workflow.template_archive" : b.archived === false && Object.keys(patch).length === 1 ? "workflow.template_restore" : "workflow.template_edit";
  await logAudit(ctx.user, { action, targetType: "workflow_template", targetId: params.id, summary: tpl.name }, ctx.admin);
  return NextResponse.json({ ok: true });
}
