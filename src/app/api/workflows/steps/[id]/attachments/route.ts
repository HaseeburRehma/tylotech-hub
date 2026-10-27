import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { config } from "@/lib/config";
import { notifyUser } from "@/lib/notify";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import {
  WF_BUCKET,
  WF_MAX_BYTES,
  isAllowedMime,
  missingAttachments,
  safeFileName,
  shareAttachmentWithClient,
  statObject,
  stepFolder,
} from "@/lib/workflow-files";
import type { StepAttachment } from "@/lib/workflows-shared";
import { UUID_RE, bad, staffContext } from "../../../_shared";

export const runtime = "nodejs";

const NOT_READY = "Attachments need database migration 0041. Ask an admin to run it.";

/**
 * Add an attachment to a step (any team member, any step state):
 *  - { kind: "link", url, name?, shareWithClient? }                 e.g. a Google Sheet
 *  - { kind: "file", phase: "start", name, size, mime }              → { path, token } signed upload
 *  - { kind: "file", phase: "finish", path, name, shareWithClient? } → registers the uploaded file
 * shareWithClient also files a copy in the partner's Documents and notifies the client.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if ("error" in ctx) return ctx.error;
  if (!UUID_RE.test(params.id)) return bad("Invalid step id.");
  const rl = await getRateLimiter().limit(`wfatt:${ctx.user.id}`, config.rateLimit.api);
  if (!rl.success) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");

  const { data: step } = await ctx.admin
    .from("workflow_run_steps")
    .select("id,run_id,title,assignee_user_id,workflow_runs(name,client_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!step) return bad("Step not found.", 404);
  const run = (Array.isArray(step.workflow_runs) ? step.workflow_runs[0] : step.workflow_runs) as { name: string; client_id: string | null } | null;
  const folder = stepFolder(step.run_id, step.id);

  // 1) File, phase "start": hand out a one-time signed upload URL for this step's folder.
  if (b.kind === "file" && b.phase === "start") {
    const name = String(b.name ?? "").trim();
    const size = Number(b.size ?? 0);
    const mime = String(b.mime ?? "").toLowerCase();
    if (!name) return bad("File name is required.");
    if (!(size > 0) || size > WF_MAX_BYTES) return bad("File too large (max 50 MB).", 413);
    if (!isAllowedMime(mime)) return bad("Unsupported file type. Use PDF, images, Excel/CSV, Word or PowerPoint.", 415);
    // Fail early (before the upload) when the table isn't there yet.
    const probe = await ctx.admin.from("workflow_step_attachments").select("id").limit(1);
    if (probe.error && missingAttachments(probe.error.message)) return bad(NOT_READY, 503);
    const path = `${folder}${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`;
    const { data, error } = await ctx.admin.storage.from(WF_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("workflow upload url failed:", error?.message);
      return bad(/bucket/i.test(error?.message ?? "") ? NOT_READY : "Upload could not be prepared.", 503);
    }
    return NextResponse.json({ ok: true, path: data.path, token: data.token, bucket: WF_BUCKET });
  }

  let row: Record<string, unknown>;
  if (b.kind === "file" && b.phase === "finish") {
    const path = String(b.path ?? "");
    if (!path.startsWith(folder) || path.includes("..")) return bad("Invalid upload.");
    const stat = await statObject(ctx.admin, path);
    if (!stat) return bad("Upload not found. Please try again.", 404);
    if (!isAllowedMime(stat.mime) || stat.size > WF_MAX_BYTES) {
      await ctx.admin.storage.from(WF_BUCKET).remove([path]);
      return bad("Unsupported file.", 415);
    }
    const name = String(b.name ?? "").trim().slice(0, 200) || path.slice(path.lastIndexOf("/") + 1);
    row = { kind: "file", name, path, mime: stat.mime, size: stat.size };
  } else if (b.kind === "link") {
    let url: URL;
    try {
      url = new URL(String(b.url ?? "").trim());
    } catch {
      return bad("Enter a valid link (https://…).");
    }
    if (url.protocol !== "https:") return bad("Only https:// links are allowed.");
    const name = String(b.name ?? "").trim().slice(0, 200) || linkName(url);
    row = { kind: "link", name, url: url.toString().slice(0, 2000) };
  } else {
    return bad("kind must be file or link.");
  }

  const { data: att, error } = await ctx.admin
    .from("workflow_step_attachments")
    .insert({ ...row, step_id: step.id, run_id: step.run_id, uploaded_by: ctx.user.id })
    .select("*")
    .single();
  if (error || !att) {
    if (row.kind === "file") await ctx.admin.storage.from(WF_BUCKET).remove([row.path as string]);
    if (missingAttachments(error?.message)) return bad(NOT_READY, 503);
    console.error("workflow attachment insert failed:", error?.message);
    return bad("Could not save the attachment.");
  }

  let shared: string | null = null;
  let shareError: string | null = null;
  if (b.shareWithClient === true && run?.client_id) {
    const res = await shareAttachmentWithClient(ctx.admin, att as StepAttachment, run.client_id, ctx.user.id);
    if ("id" in res) shared = res.id;
    else shareError = res.error;
  }

  // Let the responsible person know something was added to their step.
  if (step.assignee_user_id && step.assignee_user_id !== ctx.user.id) {
    await notifyUser(step.assignee_user_id, {
      title: `Neuer Anhang: ${step.title}`,
      body: `${ctx.user.name ?? "Team"}: ${att.name}`,
      href: `/internal/processes/${step.run_id}`,
      type: "workflow",
    }).catch(() => {});
  }
  await logAudit(
    ctx.user,
    { action: "workflow.attachment_add", clientId: run?.client_id ?? null, targetType: "workflow_step", targetId: step.id, summary: `${run?.name ?? ""} · ${step.title}: ${att.name}` },
    ctx.admin,
  );
  return NextResponse.json({ ok: true, attachment: { ...att, document_id: shared ?? att.document_id }, shareError });
}

/** "docs.google.com/spreadsheets/…" → "Google Sheet", otherwise the host name. */
function linkName(url: URL) {
  const h = url.hostname.replace(/^www\./, "");
  if (h === "docs.google.com") {
    if (url.pathname.startsWith("/spreadsheets")) return "Google Sheet";
    if (url.pathname.startsWith("/document")) return "Google Doc";
    if (url.pathname.startsWith("/presentation")) return "Google Slides";
  }
  if (h === "drive.google.com") return "Google Drive";
  if (h === "lookerstudio.google.com" || h === "datastudio.google.com") return "Looker Studio";
  return h;
}
