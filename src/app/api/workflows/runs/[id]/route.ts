import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { UUID_RE, bad, staffContext } from "../../_shared";

export const runtime = "nodejs";

/** Pause / resume a run: { status: "paused" | "active" }. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid run id.");
  const b = (await req.json().catch(() => null)) as { status?: string } | null;
  if (b?.status !== "paused" && b?.status !== "active") return bad("status must be paused or active.");

  // Only an active run can be paused and only a paused one resumed (completed stays completed).
  const from = b.status === "paused" ? "active" : "paused";
  const { data, error } = await ctx.admin
    .from("workflow_runs")
    .update({ status: b.status })
    .eq("id", params.id)
    .eq("status", from)
    .select("id,name,client_id")
    .maybeSingle();
  if (error) return bad(error.message);
  if (!data) return bad(`Only ${from} processes can be ${b.status === "paused" ? "paused" : "resumed"}.`, 409);
  await logAudit(ctx.user, { action: b.status === "paused" ? "workflow.pause" : "workflow.resume", clientId: data.client_id, targetType: "workflow_run", targetId: data.id, summary: data.name }, ctx.admin);
  return NextResponse.json({ ok: true });
}

/** Delete a run started by mistake (admin only). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (ctx.user.role !== "admin") return bad("Only admins can delete processes.", 403);
  if (!UUID_RE.test(params.id)) return bad("Invalid run id.");
  const { data, error } = await ctx.admin.from("workflow_runs").delete().eq("id", params.id).select("id,name,client_id");
  if (error) return bad(error.message);
  if (!data?.length) return bad("Process not found.", 404);
  await logAudit(ctx.user, { action: "workflow.delete", clientId: data[0]!.client_id, targetType: "workflow_run", targetId: params.id, summary: data[0]!.name }, ctx.admin);
  return NextResponse.json({ ok: true });
}
