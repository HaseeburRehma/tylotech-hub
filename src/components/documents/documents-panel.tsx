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

const META: Record<DocType, { label: string; icon: LucideIcon; variant: "info" | "brand" | "success" | "warning" }> = {
  report: { label: "Report", icon: FileText, variant: "info" },
  contract: { label: "Contract", icon: ScrollText, variant: "brand" },
  invoice: { label: "Invoice", icon: Receipt, variant: "success" },
  asset: { label: "Asset", icon: FileArchive, variant: "warning" },
};

const FILTERS: { key: DocType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "report", label: "Reports" },
  { key: "contract", label: "Contracts" },
  { key: "invoice", label: "Invoices" },
  { key: "asset", label: "Assets" },
];

export function DocumentsPanel({
  documents,
  clientId,
}: {
  documents: DocItem[];
  clientId: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<DocType | "all">("all");
  const [uploadType, setUploadType] = useState<DocType>("report");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(d.error ?? "Upload failed.");
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
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
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value as DocType)}
            className="h-9 rounded-xl border border-border bg-surface-2 px-2 text-xs outline-none focus:border-brand/50"
          >
            <option value="report" className="bg-surface">Report</option>
            <option value="contract" className="bg-surface">Contract</option>
            <option value="invoice" className="bg-surface">Invoice</option>
            <option value="asset" className="bg-surface">Asset</option>
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !clientId}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground transition-colors hover:border-brand/40 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
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
          <p className="py-10 text-center text-sm text-muted">No documents yet.</p>
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
                  <Badge variant={m.variant} className="hidden sm:inline-flex">{m.label}</Badge>
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
                    onClick={() => remove(d.id)}
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
    </div>
  );
}
