"use client";

import { motion } from "framer-motion";
import {
  ArrowDownUp,
  Check,
  Download,
  MoreHorizontal,
  Search,
  FileArchive,
  FileText,
  Loader2,
  MessageCircle,
  Receipt,
  ScrollText,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModalShell } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { Menu, MenuItem } from "@/components/ui/menu";
import { DocItem, DocType } from "@/types";
import { cn } from "@/lib/utils";
import { useT, useIntlLocale } from "@/lib/i18n/provider";
import { useUser } from "@/components/providers/user-provider";
import { APP_TZ } from "@/lib/utils";

// `label` values are i18n keys — translated at render via t().
// Figma chips: report teal, contract gold, invoice/asset neutral.
const META: Record<DocType, { label: string; icon: LucideIcon; variant: "positive" | "brand" | "neutral" }> = {
  report: { label: "documents.report", icon: FileText, variant: "positive" },
  contract: { label: "documents.contract", icon: ScrollText, variant: "brand" },
  invoice: { label: "documents.invoice", icon: Receipt, variant: "neutral" },
  asset: { label: "documents.asset", icon: FileArchive, variant: "neutral" },
};

type SortKey = "newest" | "oldest" | "name";
const SORT_LABEL: Record<SortKey, string> = { newest: "documents.sortNewest", oldest: "documents.sortOldest", name: "documents.sortName" };

/** "report.pdf" → "PDF" for the file-type tile (Figma). */
function extOf(name: string) {
  const m = name.match(/\.([a-z0-9]{1,4})$/i);
  return m ? m[1]!.toUpperCase() : "FILE";
}

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
  const dl = useIntlLocale();
  const [filter, setFilter] = useState<DocType | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [uploadType, setUploadType] = useState<DocType>("report");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DocItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const user = useUser();
  const [requestState, setRequestState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function requestReport() {
    if (!clientId) return;
    setRequestState("busy");
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, content: t("empty.requestReportMessage") }),
    }).catch(() => null);
    setRequestState(res?.ok ? "sent" : "error");
  }
  const fileRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const docs = documents
    .filter((d) => filter === "all" || d.type === filter)
    .filter((d) => !q || d.name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at),
    );
  const countOf = (k: DocType | "all") => (k === "all" ? documents.length : documents.filter((d) => d.type === k).length);
  const canDelete = (d: DocItem) => user.role !== "client" || d.uploaded_by === user.id;
  const downloadable = (d: DocItem) => !!d.file_url && !d.file_url.startsWith("#");

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", user.role === "client" ? "asset" : uploadType);
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
    const res = await fetch(`/api/documents?id=${pendingDelete.id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    setPendingDelete(null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? t("ait.actionFailed"));
      return;
    }
    setError(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + upload, then type tabs + sort (Figma) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("documents.search")}
            aria-label={t("documents.search")}
            className="input-base h-10 py-0 pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {user.role !== "client" && (
            <select
              aria-label={t("documents.typeLabel")}
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as DocType)}
              className="tool-btn pr-2"
            >
              <option value="report" className="bg-surface">{t("documents.report")}</option>
              <option value="contract" className="bg-surface">{t("documents.contract")}</option>
              <option value="invoice" className="bg-surface">{t("documents.invoice")}</option>
              <option value="asset" className="bg-surface">{t("documents.asset")}</option>
            </select>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !clientId}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-brand bg-gradient-to-b from-white/20 to-black/10 px-3.5 font-display text-sm font-semibold text-brand-foreground shadow-card transition hover:brightness-105 disabled:opacity-50 sm:flex-none ring-focus"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ key: f.key, label: t(f.label), count: countOf(f.key) }))}
        />
        <Menu
          width={200}
          align="end"
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className="tool-btn w-fit">
              <ArrowDownUp className="h-3.5 w-3.5" />
              {t(SORT_LABEL[sort])}
            </button>
          )}
        >
          {(close) =>
            (Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <MenuItem key={k} selected={sort === k} onSelect={() => { setSort(k); close(); }}>
                {t(SORT_LABEL[k])}
              </MenuItem>
            ))
          }
        </Menu>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>
      )}

      <Card className="overflow-hidden p-0">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface">
              <FileText className="h-7 w-7 text-muted" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold">{t("empty.docsTitle")}</h3>
              <p className="mx-auto max-w-sm text-sm text-muted">{t("empty.docsBody")}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !clientId}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {t("empty.uploadDoc")}
              </button>
              {user.role === "client" && (
                <button
                  type="button"
                  onClick={requestReport}
                  disabled={!clientId || requestState === "busy" || requestState === "sent"}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-bg px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-60"
                >
                  {requestState === "sent" ? <Check className="h-4 w-4 text-success" /> : <MessageCircle className="h-4 w-4" />}
                  {requestState === "sent" ? t("empty.requestSent") : t("empty.requestReport")}
                </button>
              )}
            </div>
            {requestState === "error" && <p className="text-sm text-danger">{t("ait.actionFailed")}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">{t("documents.col.document")}</th>
                  <th className="th hidden sm:table-cell">{t("documents.col.type")}</th>
                  <th className="th hidden text-right md:table-cell">{t("documents.col.size")}</th>
                  <th className="th hidden text-right sm:table-cell">{t("documents.col.date")}</th>
                  <th className="w-12 px-4 py-3"><span className="sr-only">{t("common.actions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {docs.map((d, i) => {
                  const m = META[d.type];
                  const date = new Date(d.created_at).toLocaleDateString(dl, { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" });
                  return (
                    <motion.tr
                      key={d.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 10) * 0.03 }}
                      className="hover:bg-bg/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line font-mono text-eyebrow font-medium",
                              d.type === "report" ? "bg-positive/5 text-positive" : d.type === "contract" ? "bg-brand/10 text-brand-ink" : "bg-bg text-muted",
                            )}
                          >
                            {extOf(d.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="line-clamp-2 font-display text-body font-medium text-foreground sm:line-clamp-1">{d.name}</p>
                            <p className="text-xs text-muted sm:hidden">
                              {t(m.label)} · {date}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <Badge variant={m.variant}>{t(m.label)}</Badge>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right font-mono text-body-sm text-soft md:table-cell">{d.size || "—"}</td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-body-sm text-muted sm:table-cell">{date}</td>
                      <td className="px-4 py-3 text-right">
                        {(downloadable(d) || canDelete(d)) && (
                        <Menu
                          width={190}
                          align="end"
                          trigger={({ toggle, open }) => (
                            <button
                              type="button"
                              onClick={toggle}
                              aria-expanded={open}
                              aria-label={d.name}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bg hover:text-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              {downloadable(d) && (
                                <MenuItem
                                  icon={<Download className="h-4 w-4" />}
                                  onSelect={() => {
                                    close();
                                    window.open(`/api/documents/download?id=${d.id}`, "_blank", "noopener");
                                  }}
                                >
                                  {t("documents.download")}
                                </MenuItem>
                              )}
                              {canDelete(d) && (
                                <MenuItem
                                  danger
                                  icon={<Trash2 className="h-4 w-4 text-danger" />}
                                  onSelect={() => {
                                    close();
                                    setPendingDelete(d);
                                  }}
                                >
                                  {t("documents.delete")}
                                </MenuItem>
                              )}
                            </>
                          )}
                        </Menu>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
            {docs.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">{t("documents.noMatch")}</p>}
          </div>
        )}
      </Card>

      <ModalShell open={!!pendingDelete} onClose={() => !deleting && setPendingDelete(null)} className="max-w-sm">
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <h3 className="font-display text-base font-semibold text-foreground">{t("documents.deleteTitle")}</h3>
            <p className="truncate text-sm font-medium text-foreground">{pendingDelete?.name}</p>
            <p className="text-sm text-muted">{t("documents.deleteBody")}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingDelete(null)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmRemove} loading={deleting}>
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
