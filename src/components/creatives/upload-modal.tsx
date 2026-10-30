"use client";

import { FileArchive, UploadCloud, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ACCEPT, humanBytes, type CreativeFolder } from "@/lib/creatives";
import { expandFiles, fileMeta, type SkipReason, type UploadItem } from "@/lib/creatives-upload";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const BATCH = 6;
const PARALLEL = 3;

interface Project {
  id: string;
  name: string;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "failed");
  return json;
}

/** Upload images, videos, PDFs or whole zips into a project's creatives (team only). */
export function UploadModal({
  open,
  onClose,
  projects,
  folders,
  projectId: initialProject,
  folderId: initialFolder,
  initialFiles,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  folders: CreativeFolder[];
  projectId: string | null;
  folderId: string | null;
  /** Files dropped on the page before the dialog opened. */
  initialFiles?: File[];
  onDone: (uploaded: number) => void;
}) {
  const t = useT();
  const [projectId, setProjectId] = useState(initialProject ?? projects[0]?.id ?? "");
  const [folderId, setFolderId] = useState(initialFolder ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [found, setFound] = useState(0);
  const [current, setCurrent] = useState("");
  const [skipped, setSkipped] = useState<{ name: string; why: SkipReason | "upload" }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const stop = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const projectFolders = folders.filter((f) => f.project_id === projectId).sort((a, b) => a.position - b.position);

  useEffect(() => {
    if (!open) return;
    setProjectId(initialProject ?? projects[0]?.id ?? "");
    setFolderId(initialFolder ?? "");
    setFiles(initialFiles ?? []);
    setDone(0);
    setFound(0);
    setSkipped([]);
    setError(null);
    setFinished(false);
  }, [open, initialProject, initialFolder, projects, initialFiles]);

  useEffect(() => {
    if (!projectFolders.some((f) => f.id === folderId)) setFolderId(projectFolders[0]?.id ?? "");
  }, [projectId, folderId, projectFolders]);

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...Array.from(list).filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  };

  async function run() {
    const supabase = createClient();
    if (!supabase || !folderId || !files.length) return;
    setBusy(true);
    setError(null);
    setFinished(false);
    stop.current = false;
    let uploaded = 0;
    const skip = (name: string, why: SkipReason | "upload") => setSkipped((s) => [...s, { name, why }]);

    const flush = async (items: UploadItem[]) => {
      const byFolder = new Map<string, UploadItem[]>();
      for (const it of items) byFolder.set(it.folderId, [...(byFolder.get(it.folderId) ?? []), it]);
      for (const [fid, group] of Array.from(byFolder.entries())) {
        const prep = await postJson("/api/creatives/upload", { folderId: fid, files: group.map((g) => ({ name: g.name, size: g.blob.size })) });
        const confirm: Record<string, unknown>[] = [];
        let next = 0;
        const worker = async () => {
          while (next < group.length && !stop.current) {
            const i = next++;
            const it = group[i];
            const slot = prep.files?.[i] as { path?: string; token?: string; contentType?: string; error?: string } | undefined;
            setCurrent(it.name);
            if (!slot?.path || !slot.token) {
              skip(it.name, slot?.error === "size" ? "size" : slot?.error === "type" ? "type" : "upload");
              continue;
            }
            const meta = await fileMeta(it.blob, it.name);
            const { error: upErr } = await supabase.storage.from("creatives").uploadToSignedUrl(slot.path, slot.token, it.blob, { contentType: slot.contentType });
            if (upErr) {
              skip(it.name, /size|large|413/i.test(upErr.message) ? "size" : "upload");
              continue;
            }
            confirm.push({ path: slot.path, name: it.name, ...meta, ...(it.lastModified ? { createdAt: new Date(it.lastModified).toISOString() } : {}) });
          }
        };
        await Promise.all(Array.from({ length: Math.min(PARALLEL, group.length) }, worker));
        if (confirm.length) {
          const res = await postJson("/api/creatives", { items: confirm });
          const saved = (res.creatives?.length ?? 0) as number;
          uploaded += confirm.length;
          setDone((d) => d + confirm.length);
          for (const name of (res.failed ?? []) as string[]) skip(name, "upload");
          void saved;
        }
      }
    };

    try {
      let batch: UploadItem[] = [];
      for await (const item of expandFiles(files, projectFolders, folderId, (n, why) => skip(n, why))) {
        if (stop.current) break;
        setFound((n) => n + 1);
        batch.push(item);
        if (batch.length >= BATCH) {
          await flush(batch);
          batch = [];
        }
      }
      if (batch.length && !stop.current) await flush(batch);
      setFinished(true);
      setFiles([]);
      if (uploaded) onDone(uploaded);
    } catch (e) {
      setError((e as Error).message === "failed" ? t("cr.upload.failed") : (e as Error).message);
      if (uploaded) onDone(uploaded);
    } finally {
      setBusy(false);
      setCurrent("");
    }
  }

  const total = files.reduce((n, f) => n + f.size, 0);
  const pct = found ? Math.round((done / found) * 100) : 0;
  const whyText = (w: SkipReason | "upload") => t(`cr.skip.${w}`);

  return (
    <ModalShell open={open} onClose={() => !busy && onClose()} className="max-w-xl">
      <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("cr.upload.title")}</h2>
          <p className="mt-0.5 text-body-sm text-muted">{t("cr.upload.sub")}</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label={t("common.close")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-caption font-medium text-muted">{t("cr.project")}</p>
            <Select value={projectId} onChange={setProjectId} disabled={busy} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          </div>
          <div>
            <p className="mb-1.5 text-caption font-medium text-muted">{t("cr.category")}</p>
            <Select value={folderId} onChange={setFolderId} disabled={busy || !projectFolders.length} options={projectFolders.map((f) => ({ value: f.id, label: f.name }))} />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy) add(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors",
            drag ? "border-brand bg-brand/[0.06]" : "border-line bg-surface-2/40",
          )}
        >
          <UploadCloud className="h-8 w-8 text-brand-ink" />
          <p className="text-sm font-medium">{t("cr.upload.drop")}</p>
          <p className="max-w-sm text-caption text-muted">{t("cr.upload.hint")}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-1" disabled={busy} onClick={() => input.current?.click()}>
            {t("cr.upload.choose")}
          </Button>
          <input ref={input} type="file" multiple hidden accept={`${ACCEPT},.zip`} onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
        </div>

        {files.length > 0 && !busy && (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-1.5 text-sm">
                {/\.zip$/i.test(f.name) && <FileArchive className="h-4 w-4 shrink-0 text-brand-ink" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 font-mono text-caption text-muted">{humanBytes(f.size)}</span>
                <button type="button" aria-label={t("cr.remove")} onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {(busy || finished || done > 0) && (
          <div className="space-y-1.5" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${busy ? Math.max(4, pct) : 100}%` }} />
            </div>
            <p className="text-caption text-muted">
              {busy ? t("cr.upload.progress", { done, found }) : t("cr.upload.done", { done })}
              {busy && current ? <span className="ml-1 truncate">· {current}</span> : null}
            </p>
          </div>
        )}

        {skipped.length > 0 && (
          <details className="rounded-xl bg-warning/10 px-3 py-2 text-caption">
            <summary className="cursor-pointer font-medium text-foreground">{t("cr.upload.skipped", { n: skipped.length })}</summary>
            <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-muted">
              {skipped.slice(0, 200).map((s, i) => (
                <li key={i} className="truncate">
                  {s.name}: {whyText(s.why)}
                </li>
              ))}
            </ul>
          </details>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        <span className="text-caption text-muted">{files.length ? t("cr.upload.selected", { n: files.length, size: humanBytes(total) }) : ""}</span>
        <div className="flex gap-2">
          {busy ? (
            <Button variant="secondary" onClick={() => (stop.current = true)}>
              {t("cr.upload.stop")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {finished ? t("common.close") : t("common.cancel")}
            </Button>
          )}
          <Button onClick={run} loading={busy} disabled={busy || !files.length || !folderId}>
            {t("cr.upload.start")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
