import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { WF_BUCKET } from "@/lib/workflow-files";
import { UUID_RE, bad, staffContext } from "../../_shared";

export const runtime = "nodejs";

/**
 * Pause / resume a run: { status: "paused" | "active" }, or (admin) set how it
 * repeats: { repeatEvery: "week" | "month" | null } — the next round then starts
 * by itself when this one is finished.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid run id.");
  const b = (await req.json().catch(() => null)) as { status?: string; repeatEvery?: string | null } | null;

  if (b && "repeatEvery" in b) {
    if (ctx.user.role !== "admin") return bad("Only admins can change how a process repeats.", 403);
    const every = b.repeatEvery === null || b.repeatEvery === "" ? null : b.repeatEvery;
    if (every !== null && every !== "week" && every !== "month") return bad("repeatEvery must be week, month or null.");
    const { data, error } = await ctx.admin.from("workflow_runs").update({ repeat_every: every }).eq("id", params.id).select("id,name,client_id").maybeSingle();
    if (error) {
      console.error("workflow repeat_every update failed:", error.message);
      return bad(/repeat_every/.test(error.message) ? "Repeating processes need database migration 0041." : "Could not update the process.", /repeat_every/.test(error.message) ? 503 : 400);
    }
    if (!data) return bad("Process not found.", 404);
    await logAudit(ctx.user, { action: "workflow.repeat_set", clientId: data.client_id, targetType: "workflow_run", targetId: data.id, summary: `${data.name}: ${every ?? "off"}` }, ctx.admin);
    return NextResponse.json({ ok: true });
  }

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
  if (error) {
    console.error("workflow status update failed:", error.message);
    return bad("Could not update the process.");
  }
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
  // Its uploaded files go too (rows cascade; storage doesn't). Copies already
  // filed in the partner's Documents stay.
  const { data: files } = await ctx.admin.from("workflow_step_attachments").select("path").eq("run_id", params.id).eq("kind", "file");
  const { data, error } = await ctx.admin.from("workflow_runs").delete().eq("id", params.id).select("id,name,client_id");
  if (error) {
    console.error("workflow delete failed:", error.message);
    return bad("Could not delete the process.");
  }
  if (!data?.length) return bad("Process not found.", 404);
  const paths = (files ?? []).map((f) => f.path as string).filter(Boolean);
  if (paths.length) await ctx.admin.storage.from(WF_BUCKET).remove(paths);
  await logAudit(ctx.user, { action: "workflow.delete", clientId: data[0]!.client_id, targetType: "workflow_run", targetId: params.id, summary: data[0]!.name }, ctx.admin);
  return NextResponse.json({ ok: true });
}
