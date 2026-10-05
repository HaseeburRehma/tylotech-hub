"use client";

import { Clock, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal";
import { clearAiHistory, readAiHistory, type AiHistoryEntry } from "@/lib/ai-history";
import { useT } from "@/lib/i18n/provider";
import { AI_TOOLS } from "@/lib/ai-tools";
import { useUser } from "@/components/providers/user-provider";

export function AiHistoryModal({ open, onClose, tool }: { open: boolean; onClose: () => void; tool?: string }) {
  const t = useT();
  const user = useUser();
  const [entries, setEntries] = useState<AiHistoryEntry[]>([]);

  useEffect(() => {
    if (open) setEntries(readAiHistory(user.id).filter((e) => !tool || e.tool === tool));
  }, [open, tool, user.id]);

  const toolName = (slug: string) => {
    const def = AI_TOOLS.find((x) => x.slug === slug);
    return def ? t(def.name) : slug;
  };

  return (
    <ModalShell open={open} onClose={onClose} className="max-w-xl">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Clock className="h-5 w-5 text-brand" />
          <h2 className="font-display text-lg font-semibold">{t("ait.history")}</h2>
        </div>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearAiHistory(user.id);
                setEntries([]);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("ait.historyClear")}
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-muted/30" />
            <p className="text-sm font-medium text-foreground">{t("ait.historyEmpty")}</p>
            <p className="mt-1 text-xs text-muted">{t("ait.historyEmptyDesc")}</p>
          </div>
        ) : (
          entries.map((e) => (
            <Link
              key={e.id}
              href={`/ai-tools/${e.tool}?h=${e.id}`}
              onClick={onClose}
              className="block rounded-xl px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">{toolName(e.tool)}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {new Date(e.at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{e.brand}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted/80">{e.output}</p>
            </Link>
          ))
        )}
      </div>
    </ModalShell>
  );
}
