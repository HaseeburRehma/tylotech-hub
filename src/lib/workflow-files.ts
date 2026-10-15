import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyClientUsers } from "@/lib/notify";
import type { StepAttachment } from "@/lib/workflows-shared";

/**
 * Step attachments (migration 0041). Files live in the private "workflow-files"
 * bucket under <runId>/<stepId>/…; the browser uploads them through a one-time
 * signed URL (no 4.5 MB serverless body limit), then the API registers the row
 * after checking the object really exists under that step's folder.
 */
export const WF_BUCKET = "workflow-files";
export const WF_MAX_BYTES = 50 * 1024 * 1024;

// Mirrors the bucket's allowed_mime_types. Never SVG/HTML (scriptable).
const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/zip",
]);
export const isAllowedMime = (mime: string) => ALLOWED.has(mime.toLowerCase());

export const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80) || "file";
export const stepFolder = (runId: string, stepId: string) => `${runId}/${stepId}/`;

export const missingAttachments = (msg: string | undefined) => /workflow_step_attachments|schema cache|does not exist/i.test(msg ?? "");

/** Metadata of an uploaded object, or null when it isn't there. */
export async function statObject(admin: SupabaseClient, path: string) {
  const slash = path.lastIndexOf("/");
  const { data } = await admin.storage.from(WF_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 5 });
  const obj = (data ?? []).find((o) => o.name === path.slice(slash + 1));
  if (!obj) return null;
  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  return { size: Number(meta.size ?? 0), mime: String(meta.mimetype ?? "application/octet-stream") };
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * File a copy in the partner's Documents (type "report") and tell the client.
 * Files are copied into the documents bucket under the client's folder; links
 * are stored as the document URL. Returns the document id.
 */
export async function shareAttachmentWithClient(
  admin: SupabaseClient,
  att: StepAttachment,
  clientId: string,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  if (att.document_id) return { id: att.document_id };
  let fileUrl: string;
  let docPath: string | null = null;
  if (att.kind === "link") {
    fileUrl = att.url!;
  } else {
    const { data: blob, error } = await admin.storage.from(WF_BUCKET).download(att.path!);
    if (error || !blob) return { error: "Could not read the file." };
    docPath = `${clientId}/${Date.now()}-${safeFileName(att.name)}`;
    const { error: upErr } = await admin.storage
      .from("documents")
      .upload(docPath, new Uint8Array(await blob.arrayBuffer()), { contentType: att.mime || "application/octet-stream", upsert: false });
    if (upErr) return { error: "Could not copy the file." };
    fileUrl = docPath;
  }
  const row = { client_id: clientId, name: att.name.slice(0, 200), file_url: fileUrl, type: "report", size: att.size ? humanSize(att.size) : null };
  let res = await admin.from("documents").insert({ ...row, uploaded_by: userId }).select("id").single();
  if (res.error && /uploaded_by/i.test(res.error.message)) res = await admin.from("documents").insert(row).select("id").single();
  if (res.error || !res.data) {
    if (docPath) await admin.storage.from("documents").remove([docPath]);
    return { error: "Could not file the document." };
  }
  await admin.from("workflow_step_attachments").update({ document_id: res.data.id }).eq("id", att.id);
  await notifyClientUsers(clientId, {
    title: "Neues Dokument von deinem TyloTech-Team",
    body: att.name,
    href: "/documents",
    type: "document",
  }).catch(() => {});
  return { id: res.data.id as string };
}
