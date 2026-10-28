"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useIntlLocale, useT } from "@/lib/i18n/provider";
import { RANGE_PRESETS, berlinToday, formatDay, monthGrid, presetRange, type DateRange, type RangePreset } from "@/lib/date-range";
import { cn } from "@/lib/utils";

const monthOf = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return { y, m };
};
const shift = ({ y, m }: { y: number; m: number }, n: number) => {
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
};

/** "Last 30 days: 28 Sep 2026 - 27 Oct 2026", like Ads Manager. */
export function rangeLabel(r: DateRange, t: (k: string) => string, locale: string) {
  const name = t(`range.${r.preset}`);
  if (!r.since || !r.until) return name;
  const span = r.since === r.until ? formatDay(r.since, locale) : `${formatDay(r.since, locale)} - ${formatDay(r.until, locale)}`;
  return r.preset === "custom" ? span : `${name}: ${span}`;
}

/**
 * Date range picker in the style of Meta Ads Manager: presets on the left, two
 * months to click a custom range, Cancel / Update. Days are Berlin days and
 * nothing after today can be picked.
 */
export function DateRangePicker({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  const t = useT();
  const locale = useIntlLocale();
  const today = berlinToday();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const [hover, setHover] = useState<string | null>(null);
  // Left month shown; the right one is the month after.
  const [left, setLeft] = useState(() => shift(monthOf(value.until ?? today), -1));
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    setDraft(value);
    setHover(null);
    setLeft(shift(monthOf(value.until ?? today), -1));
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    anchor.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const vw = window.innerWidth;
      const width = Math.min(760, vw - 16);
      // Right-aligned to the trigger, kept on screen.
      const leftPx = Math.max(8, Math.min(r.right - width, vw - width - 8));
      setPos({ top: r.bottom + 6, left: leftPx, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);

  const pickPreset = (p: Exclude<RangePreset, "custom">) => {
    const r = presetRange(p, today);
    setDraft(r);
    if (r.until) setLeft(shift(monthOf(r.until), -1));
  };
  const pickDay = (day: string) => {
    if (day > today) return;
    // First click starts a range, second click ends it (in either order).
    if (!draft.since || (draft.since && draft.until) || draft.preset !== "custom") {
      setDraft({ preset: "custom", since: day, until: null });
      return;
    }
    const [a, b] = day < draft.since ? [day, draft.since] : [draft.since, day];
    setDraft({ preset: "custom", since: a, until: b });
  };

  // While picking the end, preview up to the hovered day.
  const lo = draft.since && !draft.until && hover ? (hover < draft.since ? hover : draft.since) : draft.since;
  const hi = draft.since && !draft.until && hover ? (hover < draft.since ? draft.since : hover) : draft.until;
  const complete = !!draft.since === !!draft.until || draft.preset === "maximum";

  const month = (ym: { y: number; m: number }) => {
    const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(ym.y, ym.m - 1, 1)));
    const wd = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + i))));
    return (
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-center text-sm font-semibold capitalize text-foreground">{title}</p>
        <div className="grid grid-cols-7 text-center text-caption text-muted">
          {wd.map((d) => (
            <span key={d} className="py-1">
              {d.replace(".", "").slice(0, 2)}
            </span>
          ))}
        </div>
        <div role="grid" className="grid grid-cols-7 gap-y-1">
          {monthGrid(ym.y, ym.m)
            .flat()
            .map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const future = day > today;
              const edge = day === lo || day === hi;
              const inside = !!lo && !!hi && day > lo && day < hi;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  disabled={future}
                  aria-selected={edge || inside}
                  aria-label={formatDay(day, locale)}
                  onClick={() => pickDay(day)}
                  onMouseEnter={() => setHover(day)}
                  className={cn(
                    "relative h-8 text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:text-muted/40",
                    inside && "bg-brand/15 text-foreground",
                    edge ? "rounded-lg bg-brand font-semibold text-brand-foreground" : !inside && "rounded-lg text-foreground hover:bg-surface-2",
                    day === today && !edge && "font-semibold text-brand-ink",
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
        </div>
      </div>
    );
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className={cn(
          "inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-border bg-bg px-3 text-sm text-foreground outline-none transition-colors field-focus hover:bg-surface-2/60",
          value.preset !== "maximum" && "border-brand/40 bg-brand/5",
          open && "border-[rgb(var(--focus))]",
          className,
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
        <span className="truncate">{rangeLabel(value, t, locale)}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={t("range.title")}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[80] flex max-h-[calc(100vh-24px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-float sm:flex-row"
          >
            {/* Presets */}
            <div className="max-h-56 shrink-0 overflow-y-auto border-b border-border p-2 sm:max-h-none sm:w-52 sm:border-b-0 sm:border-r">
              <p className="px-2 pb-1 pt-1 text-eyebrow font-semibold uppercase tracking-wide text-muted">{t("range.title")}</p>
              {RANGE_PRESETS.map((p) => (
                <label key={p} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2", draft.preset === p && "bg-surface-2 font-medium")}>
                  <input type="radio" name="range-preset" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={draft.preset === p} onChange={() => pickPreset(p)} />
                  {t(`range.${p}`)}
                </label>
              ))}
              <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2", draft.preset === "custom" && "bg-surface-2 font-medium")}>
                <input type="radio" name="range-preset" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={draft.preset === "custom"} onChange={() => setDraft((d) => ({ ...d, preset: "custom", since: d.since ?? today, until: d.until ?? today }))} />
                {t("range.custom")}
              </label>
            </div>
            {/* Calendars */}
            <div className="flex min-w-0 flex-1 flex-col p-4">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => setLeft((l) => shift(l, -1))} aria-label={t("range.prevMonth")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex min-w-0 flex-1 gap-6">
                  <div className="hidden min-w-0 flex-1 sm:block">{month(left)}</div>
                  {month(shift(left, 1))}
                </div>
                <button type="button" onClick={() => setLeft((l) => shift(l, 1))} aria-label={t("range.nextMonth")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{draft.preset === "maximum" ? t("range.maximum") : draft.since ? formatDay(draft.since, locale) : "…"}</span>
                {draft.preset !== "maximum" && (
                  <>
                    <span className="text-muted">-</span>
                    <span className="font-medium text-foreground">{draft.until ? formatDay(draft.until, locale) : t("range.pickEnd")}</span>
                  </>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                <p className="text-caption text-muted">{t("range.berlin")}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={close}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!complete}
                    onClick={() => {
                      onChange(draft.preset === "maximum" ? { preset: "maximum", since: null, until: null } : draft);
                      close();
                    }}
                  >
                    {t("range.update")}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
