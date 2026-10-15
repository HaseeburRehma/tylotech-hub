import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { repeatRun } from "@/lib/workflows";
import { UUID_RE, bad, staffContext } from "../../../_shared";

export const runtime = "nodejs";

/**
 * Start the next round of a process now (admin): same steps and people, step 1
 * active with its deadline moved on. The earlier round stays as it is.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.user.role !== "admin") return bad("Only admins can start a new round.", 403);
  if (!UUID_RE.test(params.id)) return bad("Invalid run id.");
  const { data: run } = await ctx.admin.from("workflow_runs").select("id,name,client_id").eq("id", params.id).maybeSingle();
  if (!run) return bad("Process not found.", 404);

  const id = await repeatRun(ctx.admin, run.id, ctx.user.id);
  if (!id) return bad("Could not start the next round.");
  await logAudit(ctx.user, { action: "workflow.repeat", clientId: run.client_id, targetType: "workflow_run", targetId: id, summary: run.name }, ctx.admin);
  return NextResponse.json({ ok: true, id });
}
