"use client";

import { cn } from "@/lib/utils";

/**
 * Figma filter tabs ("All 10 · Growth 9 · Scale 1"): a tinted track with the
 * active option raised on white. Scrolls sideways on phones instead of wrapping.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { key: K; label: React.ReactNode; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-line/70 p-1", className)}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-body-sm transition-colors",
              active ? "bg-surface font-medium text-foreground shadow-card" : "text-soft hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1.5 font-mono text-eyebrow text-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
