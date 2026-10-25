"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Popover menu rendered in a portal with fixed positioning, so it isn't clipped
 * by scrolling/overflow containers such as tables.
 */
const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

export function Menu({
  trigger,
  children,
  align = "start",
  width = 200,
  header,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  /** Panel width in px, or "anchor" to match the trigger (form selects). */
  width?: number | "anchor";
  /** Pinned above the scrolling items, e.g. a search field. */
  header?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Hand focus back to the trigger when the menu closes from inside (item pick, Escape).
  const close = useCallback(() => {
    const inside = panelRef.current?.contains(document.activeElement);
    setOpen(false);
    if (inside) anchorRef.current?.querySelector<HTMLElement>("button,[tabindex]")?.focus();
  }, []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const w = width === "anchor" ? Math.max(r.width, 180) : width;
      const panelH = panelRef.current?.offsetHeight ?? 0;
      const left = align === "end" ? r.right - w : r.left;
      const below = r.bottom + 6;
      const top = below + panelH > window.innerHeight - 8 && r.top - panelH - 6 > 8 ? r.top - panelH - 6 : below;
      setPos({ top, left: Math.max(8, Math.min(left, window.innerWidth - w - 8)), width: w });
    };
    place();
    // Second pass once the panel has measured its height; then move focus in
    // (selected item first) unless something inside — a search field — has it.
    const raf = requestAnimationFrame(() => {
      place();
      const panel = panelRef.current;
      const list = listRef.current;
      if (!panel || !list || panel.contains(document.activeElement)) return;
      const el = panel.querySelector<HTMLElement>('[data-selected="true"]') ?? panel.querySelector<HTMLElement>(ITEM_SELECTOR);
      if (!el) return;
      // preventScroll + manual centring: a native focus scroll could move the page and close the menu.
      el.focus({ preventScroll: true });
      list.scrollTop = el.offsetTop - list.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
    });
    return () => cancelAnimationFrame(raf);
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture phase so Escape closes only this menu, not a modal it sits in.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "Tab") return setOpen(false);
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? items.length - 1
        : e.key === "ArrowDown" ? (i + 1) % items.length
        : i <= 0 ? items.length - 1 : i - 1;
      items[next].focus();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  return (
    <>
      <span ref={anchorRef} className={width === "anchor" ? "flex w-full min-w-0" : "inline-flex min-w-0 max-w-full"}>
        {trigger({ open, toggle })}
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? (width === "anchor" ? 240 : width) }}
            className="fixed z-[70] flex max-h-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-float"
          >
            {header && <div className="shrink-0 border-b border-line p-1.5">{header}</div>}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
              {children(close)}
            </div>
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
      data-selected={selected ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
        danger ? "text-danger hover:bg-danger/10 focus-visible:bg-danger/10" : "text-foreground hover:bg-surface-2 focus-visible:bg-surface-2",
      )}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-brand-ink" />}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted/70">{children}</p>;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
