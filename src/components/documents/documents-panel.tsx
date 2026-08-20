"use client";

import { motion } from "framer-motion";
import {
  Download,
  FileArchive,
  FileText,
  Loader2,
  Receipt,
  ScrollText,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DocItem, DocType } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

// `label` values are i18n keys — translated at render via t().
const META: Record<DocType, { label: string; icon: LucideIcon; variant: "info" | "brand" | "success" | "warning" }> = {
  report: { label: "documents.report", icon: FileText, variant: "info" },
  contract: { label: "documents.contract", icon: ScrollText, variant: "brand" },
  invoice: { label: "documents.invoice", icon: Receipt, variant: "success" },
  asset: { label: "documents.asset", icon: FileArchive, variant: "warning" },
};

const FILTERS: { key: DocType | "all"; label: string }[] = [
  { key: "all", label: "documents.all" },
  { key: "report", label: "documents.reports" },
  { key: "contract", label: "documents.contracts" },
  { key: "invoice", label: "documents.invoices" },
  { key: "asset", label: "documents.assets" },
];

export function DocumentsPanel({
  documents,
  clientId,
}: {
  documents: DocItem[];
  clientId: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [filter, setFilter] = useState<DocType | "all">("all");
  const [uploadType, setUploadType] = useState<DocType>("report");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const docs = documents.filter((d) => filter === "all" || d.type === filter);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", uploadType);
    if (clientId) fd.append("clientId", clientId);
    const res = await fetch("/api/documents", { method: "POST", body: fd }).catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? t("documents.uploadFailed"));
      return;
    }
    router.refresh();
  }

  async function confirmRemove() {
    if (!pendingDelete) return;
    setDeleting(true);
    await fetch(`/api/documents?id=${pendingDelete.id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value as DocType)}
            className="h-9 rounded-xl border border-border bg-surface-2 px-2 text-xs outline-none focus:border-brand/50"
          >
            <option value="report" className="bg-surface">{t("documents.report")}</option>
            <option value="contract" className="bg-surface">{t("documents.contract")}</option>
            <option value="invoice" className="bg-surface">{t("documents.invoice")}</option>
            <option value="asset" className="bg-surface">{t("documents.asset")}</option>
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !clientId}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors hover:border-brand/40 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("documents.upload")}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>
      )}

      <Card className="p-2">
        {docs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">{t("documents.noDocs")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d, i) => {
              const m = META[d.type];
              const Icon = m.icon;
              return (
                <motion.li
                  key={d.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="group flex items-center gap-4 rounded-xl p-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted group-hover:bg-brand/15 group-hover:text-brand">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted">
                      {new Date(d.created_at).toLocaleDateString("en-DE", { day: "numeric", month: "long", year: "numeric" })}
                      {d.size ? ` · ${d.size}` : ""}
                    </p>
                  </div>
                  <Badge variant={m.variant} className="hidden sm:inline-flex">{t(m.label)}</Badge>
                  {d.file_url && !d.file_url.startsWith("#") ? (
                    <a
                      href={`/api/documents/download?id=${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      aria-label={`Download ${d.name}`}
                    >
                      <Download className="h-[18px] w-[18px]" />
                    </a>
                  ) : (
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-muted/30"
                      title="Sample document — no file attached"
                    >
                      <Download className="h-[18px] w-[18px]" />
                    </span>
                  )}
                  <button
                    onClick={() => setPendingDelete(d)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:text-danger"
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </Card>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleting && setPendingDelete(null)}
        >
          <Card
            className="w-full max-w-sm space-y-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-foreground">{t("documents.deleteTitle")}</h3>
              <p className="truncate text-sm font-medium text-foreground">{pendingDelete.name}</p>
              <p className="text-sm text-muted">{t("documents.deleteBody")}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="inline-flex h-9 items-center rounded-xl border border-border px-3.5 text-sm text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmRemove}
                disabled={deleting}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-danger px-3.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.delete")}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
