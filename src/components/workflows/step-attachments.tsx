"use client";

import { FileSpreadsheet, FileText, FolderInput, Image as ImageIcon, Link2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AttachmentViewer, type ViewerItem } from "@/components/chat/attachment-viewer";
import { Button } from "@/components/ui/button";
import { useUser } from "@/components/providers/user-provider";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RunStep, StaffOption, StepAttachment } from "@/lib/workflows-shared";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.csv,.txt,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.ods,.odt,.zip";
// Browsers sometimes leave file.type empty (e.g. .csv on Windows) — fall back to the extension.
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  csv: "text/csv",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odt: "application/vnd.oasis.opendocument.text",
  zip: "application/zip",
};
const mimeOf = (f: File) => f.type || EXT_MIME[f.name.split(".").pop()?.toLowerCase() ?? ""] || "";

export const attachmentHref = (a: StepAttachment) => (a.kind === "link" ? a.url! : `/api/workflows/attachments/${a.id}?v=1`);

function humanSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentIcon({ a, className }: { a: Pick<StepAttachment, "kind" | "mime" | "url">; className?: string }) {
  if (a.kind === "link") {
    return /docs\.google\.com\/spreadsheets/.test(a.url ?? "") ? <FileSpreadsheet className={className} /> : <Link2 className={className} />;
  }
  if (a.mime?.startsWith("image/")) return <ImageIcon className={className} />;
  if (/sheet|excel|csv/.test(a.mime ?? "")) return <FileSpreadsheet className={className} />;
  return <FileText className={className} />;
}

async function json(res: Response | null) {
  const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: !!res?.ok, data, error: (data.error as string | undefined) ?? null };
}

/**
 * Files and links on a step — the weekly report as PDF / image / Excel, or a
 * Google Sheet link. Anyone on the team can add; whoever added it (or an admin)
 * can remove. Optionally files a copy in the partner's Documents (client is
 * notified). Images and PDFs open in the in-app viewer.
 */
export function StepAttachments({ step, staff, hasPartner }: { step: RunStep; staff: StaffOption[]; hasPartner: boolean }) {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<StepAttachment[]>(step.attachments ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [toClient, setToClient] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? t("wf.formerMember") : "-");

  const files = items.filter((a) => a.kind === "file");
  const viewerItems: ViewerItem[] = files.map((a) => ({
    id: a.id,
    name: a.name,
    mime: a.mime ?? "application/octet-stream",
    url: attachmentHref(a),
    sender: nameOf(a.uploaded_by),
    createdAt: a.created_at,
  }));

  async function upload(list: FileList | File[]) {
    setError(null);
    const sb = createClient();
    if (!sb) return setError(t("ait.actionFailed"));
    for (const file of Array.from(list)) {
      const mime = mimeOf(file);
      if (file.size > MAX_BYTES) {
        setError(t("wf.att.tooBig", { name: file.name }));
        continue;
      }
      if (!mime) {
        setError(t("wf.att.badType", { name: file.name }));
        continue;
      }
      setBusy(`up:${file.name}`);
      const start = await json(
        await fetch(`/api/workflows/steps/${step.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "file", phase: "start", name: file.name, size: file.size, mime }),
        }).catch(() => null),
      );
      if (!start.ok) {
        setBusy(null);
        setError(start.error ?? t("ait.actionFailed"));
        return;
      }
      const { path, token, bucket } = start.data as { path: string; token: string; bucket: string };
      const { error: upErr } = await sb.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: mime });
      if (upErr) {
        setBusy(null);
        setError(`${file.name}: ${upErr.message}`);
        return;
      }
      const done = await json(
        await fetch(`/api/workflows/steps/${step.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "file", phase: "finish", path, name: file.name, shareWithClient: toClient }),
        }).catch(() => null),
      );
      setBusy(null);
      if (!done.ok) {
        setError(done.error ?? t("ait.actionFailed"));
        return;
      }
      setItems((prev) => [...prev, done.data.attachment as StepAttachment]);
      if (done.data.shareError) setError(String(done.data.shareError));
    }
    router.refresh();
  }

  async function addLink() {
    setError(null);
    setBusy("link");
    const res = await json(
      await fetch(`/api/workflows/steps/${step.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "link", url: linkUrl.trim(), name: linkName.trim() || undefined, shareWithClient: toClient }),
      }).catch(() => null),
    );
    setBusy(null);
    if (!res.ok) return setError(res.error ?? t("ait.actionFailed"));
    setItems((prev) => [...prev, res.data.attachment as StepAttachment]);
    setLinkUrl("");
    setLinkName("");
    setLinkOpen(false);
    router.refresh();
  }

  async function remove(a: StepAttachment) {
    setBusy(a.id);
    setError(null);
    const res = await json(await fetch(`/api/workflows/attachments/${a.id}`, { method: "DELETE" }).catch(() => null));
    setBusy(null);
    if (!res.ok) return setError(res.error ?? t("ait.actionFailed"));
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    router.refresh();
  }

  async function shareClient(a: StepAttachment) {
    setBusy(a.id);
    setError(null);
    const res = await json(
      await fetch(`/api/workflows/attachments/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share-client" }),
      }).catch(() => null),
    );
    setBusy(null);
    if (!res.ok) return setError(res.error ?? t("ait.actionFailed"));
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, document_id: String(res.data.documentId) } : x)));
  }

  function open(a: StepAttachment) {
    if (a.kind === "link") return window.open(a.url!, "_blank", "noopener,noreferrer");
    setViewer(files.findIndex((f) => f.id === a.id));
  }

  return (
    <div
      className={cn("rounded-xl border border-dashed p-3 transition-colors", dragging ? "border-brand bg-brand/5" : "border-border")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" /> {t("wf.att.title")}
          {items.length > 0 && <span className="rounded-full bg-surface-2 px-1.5 text-eyebrow text-foreground">{items.length}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && upload(e.target.files).then(() => (e.target.value = ""))} />
          <Button size="sm" variant="secondary" loading={!!busy?.startsWith("up:")} onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {t("wf.att.upload")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen}>
            <Link2 className="h-3.5 w-3.5" /> {t("wf.att.addLink")}
          </Button>
        </div>
      </div>

      {hasPartner && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={toClient} onChange={(e) => setToClient(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
          {t("wf.att.alsoClient")}
        </label>
      )}

      {linkOpen && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
          <input
            type="url"
            inputMode="url"
            placeholder="https://docs.google.com/spreadsheets/…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && linkUrl.trim() && addLink()}
            className="input-base h-9 py-0 text-sm"
            aria-label={t("wf.att.linkUrl")}
            autoFocus
          />
          <input
            type="text"
            placeholder={t("wf.att.linkName")}
            value={linkName}
            maxLength={200}
            onChange={(e) => setLinkName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && linkUrl.trim() && addLink()}
            className="input-base h-9 py-0 text-sm"
            aria-label={t("wf.att.linkName")}
          />
          <Button size="sm" loading={busy === "link"} disabled={!linkUrl.trim()} onClick={addLink}>
            <Plus className="h-3.5 w-3.5" /> {t("wf.att.add")}
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={t("common.close")}>
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("wf.att.empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((a) => {
            const canDelete = a.uploaded_by === user.id || user.role === "admin";
            return (
              <li key={a.id} className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <AttachmentIcon a={a} className="h-4 w-4" />
                </span>
                <button type="button" onClick={() => open(a)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-foreground hover:underline">{a.name}</p>
                  <p className="truncate text-caption text-muted">
                    {[a.kind === "link" ? safeHost(a.url) : humanSize(a.size), nameOf(a.uploaded_by), fmt(a.created_at)].filter(Boolean).join(" · ")}
                    {a.document_id && <span className="ml-1.5 text-success">· {t("wf.att.inDocuments")}</span>}
                  </p>
                </button>
                {hasPartner && !a.document_id && (
                  <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => shareClient(a)} title={t("wf.att.fileForClient")} aria-label={t("wf.att.fileForClient")}>
                    <FolderInput className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => remove(a)} aria-label={t("wf.att.remove")} title={t("wf.att.remove")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AttachmentViewer items={viewerItems} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
    </div>
  );
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
function safeHost(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}
