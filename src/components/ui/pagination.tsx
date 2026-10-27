"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Page numbers to show: always first and last, the current page with one
 * neighbour each side, gaps as "…". 1 2 3 4 5 for short lists.
 */
export function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: Math.max(total, 0) }, (_, i) => i + 1);
  const keep = new Set([1, total, current - 1, current, current + 1]);
  // Near the ends, show enough pages so the row doesn't jump in width.
  if (current <= 3) [2, 3, 4].forEach((p) => keep.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => keep.add(p));
  const pages = Array.from(keep)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) out.push(p - pages[i - 1] === 2 ? p - 1 : "…");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  onPage,
  labels,
  className,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  labels: { prev: string; next: string; page: (n: number) => string };
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const btn = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1", className)}>
      <button type="button" className={cn(btn, "text-muted hover:bg-surface-2 hover:text-foreground")} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={labels.prev}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageList(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-label={labels.page(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(btn, p === page ? "bg-brand font-semibold text-brand-foreground" : "text-foreground hover:bg-surface-2", "hidden sm:inline-flex", p === page && "inline-flex")}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={cn(btn, "text-muted hover:bg-surface-2 hover:text-foreground")} onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label={labels.next}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
