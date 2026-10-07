import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { loadTemplates } from "@/lib/workflows";
import { bad, staffContext } from "../_shared";
import { parseSteps } from "./parse";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  return NextResponse.json({ templates: await loadTemplates(ctx.admin, { includeArchived }) });
}

/** Create a template: { name, description?, steps: [{ title, instructions?, defaultAssigneeRole?, defaultAssigneeUserId?, dueOffsetDays? }] } */
export async function POST(req: Request) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");
  const name = String(b.name ?? "").trim();
  if (!name || name.length > 120) return bad("Name must be 1–120 characters.");
  const description = String(b.description ?? "").trim().slice(0, 1000) || null;
  const steps = parseSteps(b.steps);
  if ("error" in steps) return bad(steps.error);

  const { data: tpl, error } = await ctx.admin
    .from("workflow_templates")
    .insert({ name, description, created_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !tpl) return bad(error?.message ?? "Could not create the template.");
  const { error: sErr } = await ctx.admin.from("workflow_template_steps").insert(steps.rows.map((s) => ({ ...s, template_id: tpl.id })));
  if (sErr) {
    await ctx.admin.from("workflow_templates").delete().eq("id", tpl.id);
    return bad(sErr.message);
  }
  await logAudit(ctx.user, { action: "workflow.template_create", targetType: "workflow_template", targetId: tpl.id, summary: `${name} (${steps.rows.length} steps)` }, ctx.admin);
  return NextResponse.json({ ok: true, id: tpl.id });
}
