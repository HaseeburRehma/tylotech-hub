import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { WF_BUCKET, shareAttachmentWithClient } from "@/lib/workflow-files";
import type { StepAttachment } from "@/lib/workflows-shared";
import { UUID_RE, bad, staffContext } from "../../_shared";

export const runtime = "nodejs";

async function load(admin: Parameters<typeof shareAttachmentWithClient>[0], id: string) {
  const { data } = await admin.from("workflow_step_attachments").select("*, workflow_runs(name,client_id)").eq("id", id).maybeSingle();
  if (!data) return null;
  const run = (Array.isArray(data.workflow_runs) ? data.workflow_runs[0] : data.workflow_runs) as { name: string; client_id: string | null } | null;
  return { att: data as StepAttachment, run };
}

/**
 * Open an attachment (staff only): files → short-lived signed URL, links → the
 * link itself. ?json=1 returns { url } instead of redirecting; ?download=1
 * forces a download instead of the inline view.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid id.");
  const found = await load(ctx.admin, params.id);
  if (!found) return bad("Not found.", 404);
  const { att } = found;
  const q = new URL(req.url).searchParams;
  let url: string;
  if (att.kind === "link") {
    url = att.url!;
  } else {
    const { data, error } = await ctx.admin.storage
      .from(WF_BUCKET)
      .createSignedUrl(att.path!, 120, q.get("download") === "1" ? { download: att.name } : undefined);
    if (error || !data) return bad("Could not generate link.");
    url = data.signedUrl;
  }
  return q.get("json") === "1" ? NextResponse.json({ url, kind: att.kind, mime: att.mime, name: att.name }) : NextResponse.redirect(url);
}

/** { action: "share-client" } — file a copy in the partner's Documents (and notify the client). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid id.");
  const b = (await req.json().catch(() => null)) as { action?: string } | null;
  if (b?.action !== "share-client") return bad("Unknown action.");
  const found = await load(ctx.admin, params.id);
  if (!found) return bad("Not found.", 404);
  if (!found.run?.client_id) return bad("This process has no partner.");
  if (found.att.document_id) return NextResponse.json({ ok: true, documentId: found.att.document_id });
  const res = await shareAttachmentWithClient(ctx.admin, found.att, found.run.client_id, ctx.user.id);
  if ("error" in res) return bad(res.error);
  await logAudit(
    ctx.user,
    { action: "workflow.attachment_share", clientId: found.run.client_id, targetType: "document", targetId: res.id, summary: `${found.run.name} · ${found.att.name}` },
    ctx.admin,
  );
  return NextResponse.json({ ok: true, documentId: res.id });
}

/** Remove an attachment (whoever added it, or an admin). A copy already filed in Documents stays. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid id.");
  const found = await load(ctx.admin, params.id);
  if (!found) return bad("Not found.", 404);
  const { att, run } = found;
  if (att.uploaded_by !== ctx.user.id && ctx.user.role !== "admin") return bad("Only the person who added it (or an admin) can remove it.", 403);
  const { error } = await ctx.admin.from("workflow_step_attachments").delete().eq("id", att.id);
  if (error) return bad("Could not remove the attachment.");
  if (att.kind === "file" && att.path) await ctx.admin.storage.from(WF_BUCKET).remove([att.path]);
  await logAudit(
    ctx.user,
    { action: "workflow.attachment_delete", clientId: run?.client_id ?? null, targetType: "workflow_step", targetId: att.step_id, summary: `${run?.name ?? ""} · ${att.name}` },
    ctx.admin,
  );
  return NextResponse.json({ ok: true });
}
