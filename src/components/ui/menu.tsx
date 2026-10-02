"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Popover menu rendered in a portal with fixed positioning, so it isn't clipped
 * by scrolling/overflow containers such as tables.
 */
export function Menu({
  trigger,
  children,
  align = "start",
  width = 200,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const panelH = panelRef.current?.offsetHeight ?? 0;
      const left = align === "end" ? r.right - width : r.left;
      const below = r.bottom + 6;
      const top = below + panelH > window.innerHeight - 8 && r.top - panelH - 6 > 8 ? r.top - panelH - 6 : below;
      setPos({ top, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) });
    };
    place();
    // Second pass once the panel has measured its height.
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {trigger({ open, toggle })}
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
            className="fixed z-[70] max-h-80 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-float"
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  onSelect,
  selected,
  danger,
  icon,
  children,
}: {
  onSelect: () => void;
  selected?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "text-foreground hover:bg-surface-2",
      )}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-brand" />}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted/70">{children}</p>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
