"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/provider";

export interface ViewerItem {
  id: string;
  name: string;
  mime: string;
  /** Same-origin attachment URL (redirects to a short-lived signed URL). */
  url: string;
  sender: string;
  createdAt: string;
}

/**
 * In-app preview for chat attachments (like Slack / WhatsApp): images, PDFs,
 * video and audio open in an overlay in the same tab; ← / → step through the
 * conversation's attachments, Esc closes. Other file types offer a download.
 */
export function AttachmentViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: ViewerItem[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const open = index !== null && !!items[index];
  const item = open ? items[index!]! : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index! > 0) onIndex(index! - 1);
      else if (e.key === "ArrowRight" && index! < items.length - 1) onIndex(index! + 1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, index, items.length, onClose, onIndex]);

  if (!mounted) return null;
  const when = item
    ? new Date(item.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const navBtn = "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20";

  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          key="viewer"
          role="dialog"
          aria-modal="true"
          aria-label={item.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] flex flex-col bg-black/90 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* Top bar */}
          <div className="flex shrink-0 items-center gap-3 px-4 py-3 text-white sm:px-6" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="truncate text-xs text-white/60">
                {item.sender} · {when}
                {items.length > 1 ? ` · ${index! + 1} / ${items.length}` : ""}
              </p>
            </div>
            <a
              href={`${item.url}&download=1`}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{t("chat.preview.download")}</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
            {index! > 0 && (
              <button type="button" aria-label={t("chat.preview.prev")} className={`${navBtn} left-3`} onClick={(e) => { e.stopPropagation(); onIndex(index! - 1); }}>
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {item.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.id}
                src={item.url}
                alt={item.name}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
              />
            ) : item.mime === "application/pdf" ? (
              <iframe
                key={item.id}
                src={item.url}
                title={item.name}
                onClick={(e) => e.stopPropagation()}
                className="h-full w-full max-w-5xl rounded-lg bg-white shadow-2xl"
              />
            ) : item.mime.startsWith("video/") ? (
              <video key={item.id} src={item.url} controls autoPlay onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg shadow-2xl" />
            ) : item.mime.startsWith("audio/") ? (
              <audio key={item.id} src={item.url} controls autoPlay onClick={(e) => e.stopPropagation()} className="w-full max-w-md" />
            ) : (
              <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 px-10 py-8 text-center text-white">
                <FileText className="h-10 w-10 text-white/70" />
                <p className="max-w-xs truncate text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-white/60">{t("chat.preview.none")}</p>
                <a href={`${item.url}&download=1`} className="mt-1 flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black">
                  <Download className="h-4 w-4" /> {t("chat.preview.download")}
                </a>
              </div>
            )}
            {index! < items.length - 1 && (
              <button type="button" aria-label={t("chat.preview.next")} className={`${navBtn} right-3`} onClick={(e) => { e.stopPropagation(); onIndex(index! + 1); }}>
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
