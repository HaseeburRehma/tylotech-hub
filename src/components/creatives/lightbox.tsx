"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Tag, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { humanBytes, type Creative } from "@/lib/creatives";
import { useIntlLocale, useT } from "@/lib/i18n/provider";
import { APP_TZ } from "@/lib/utils";
import { PlatformMark } from "./platform-mark";
import { SourceLogo } from "./source-logo";

export const fileUrl = (id: string, q = "") => `/api/creatives/${id}/file${q ? `?${q}` : ""}`;

export function duration(sec: number | null) {
  if (!sec) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Full-screen preview with arrows (and ← →), download and, for the team, delete. */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  onDelete,
  onTag,
}: {
  items: Creative[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete?: (c: Creative) => void;
  onTag?: (c: Creative) => void;
}) {
  const t = useT();
  const dl = useIntlLocale();
  const c = items[index];
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [c?.id]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [index, items.length, onClose, onIndex]);

  if (!c || typeof document === "undefined") return null;
  const meta = [
    c.width && c.height ? `${c.width}×${c.height}` : "",
    duration(c.duration_sec),
    humanBytes(c.size_bytes),
    new Date(c.created_at).toLocaleDateString(dl, { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" }),
  ].filter(Boolean);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={c.name} className="fixed inset-0 z-[90] flex flex-col bg-black/90 text-white">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        {c.source !== "upload" && <SourceLogo provider={c.source} size={22} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <p className="flex min-w-0 items-center gap-1.5 truncate text-caption text-white/60">
            {(c.platforms ?? []).map((pl) => (
              <PlatformMark key={pl} platform={pl} size={14} />
            ))}
            <span className="truncate">{[c.campaign ?? "", ...meta].filter(Boolean).join(" · ")}</span>
          </p>
        </div>
        <span className="hidden font-mono text-caption text-white/50 sm:inline">
          {index + 1} / {items.length}
        </span>
        {c.external_url && (
          <a href={c.external_url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white" title={t("cr.openSource")} aria-label={t("cr.openSource")}>
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <a href={fileUrl(c.id, "download=1")} className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white" title={t("cr.download")} aria-label={t("cr.download")}>
          <Download className="h-4 w-4" />
        </a>
        {onTag && (
          <button type="button" onClick={() => onTag(c)} className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white" title={t("cr.tag.button")} aria-label={t("cr.tag.button")}>
            <Tag className="h-4 w-4" />
          </button>
        )}
        {onDelete && c.source === "upload" && (
          <button type="button" onClick={() => onDelete(c)} className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-red-300" title={t("common.delete")} aria-label={t("common.delete")}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label={t("common.close")}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {failed ? (
          <p className="text-sm text-white/70">{t("cr.previewFailed")}</p>
        ) : c.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={c.id} src={fileUrl(c.id)} alt={c.name} onError={() => setFailed(true)} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : c.kind === "video" ? (
          <video key={c.id} src={fileUrl(c.id)} controls autoPlay playsInline onError={() => setFailed(true)} className="max-h-full max-w-full rounded-lg bg-black" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileText className="h-14 w-14 text-white/70" />
            <a href={fileUrl(c.id)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20">
              {t("cr.openPdf")}
            </a>
          </div>
        )}
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label={t("cr.prev")} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 hover:bg-white/20 sm:left-4">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {index < items.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label={t("cr.next")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 hover:bg-white/20 sm:right-4">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
