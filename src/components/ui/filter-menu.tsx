"use client";

import { ChevronDown } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  /** Shown before the label (a colour dot, avatar, badge…). */
  icon?: React.ReactNode;
  /** Small count on the right. */
  count?: number;
}

/**
 * Filter dropdown for list headers: "Label: Value ▾". Tinted while it filters
 * something (value differs from the default), so active filters stand out.
 */
export function FilterMenu<T extends string>({
  label,
  value,
  defaultValue,
  options,
  onChange,
  width = 240,
  className,
}: {
  label: string;
  value: T;
  defaultValue: T;
  options: FilterOption<T>[];
  onChange: (v: T) => void;
  width?: number;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  const active = value !== defaultValue;
  return (
    <Menu
      width={width}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${label}: ${current?.label ?? ""}`}
          onClick={toggle}
          className={cn(
            "inline-flex h-10 min-w-0 items-center gap-1.5 rounded-xl border px-3 text-sm outline-none transition-colors field-focus",
            active ? "border-brand/40 bg-brand/5 text-foreground" : "border-border bg-bg text-foreground hover:bg-surface-2/60",
            open && "border-[rgb(var(--focus))]",
            className,
          )}
        >
          <span className="shrink-0 text-muted">{label}:</span>
          {current?.icon && <span className="flex shrink-0 items-center">{current.icon}</span>}
          <span className={cn("truncate", active && "font-medium")}>{current?.label}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) =>
        options.map((o) => (
          <MenuItem
            key={o.value}
            icon={o.icon}
            selected={o.value === value}
            onSelect={() => {
              onChange(o.value);
              close();
            }}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{o.label}</span>
              {o.count != null && <span className="shrink-0 text-caption tabular-nums text-muted">{o.count}</span>}
            </span>
          </MenuItem>
        ))
      }
    </Menu>
  );
}
