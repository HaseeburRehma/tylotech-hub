"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { Menu, MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/** Form dropdown in the input style; adds a search field once the list gets long. */
export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  searchFrom = 8,
  disabled,
}: {
  id?: string;
  value: T | "";
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  searchFrom?: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const searchable = options.length >= searchFrom;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <Menu
      width="anchor"
      header={
        searchable ? (
          <label className="flex items-center gap-2 rounded-lg bg-bg px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
            />
          </label>
        ) : undefined
      }
      trigger={({ open, toggle }) => (
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setQuery("");
            toggle();
          }}
          className={cn(
            "flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-bg pl-3.5 pr-3 text-left text-sm outline-none transition-colors field-focus disabled:opacity-50",
            open && "border-[rgb(var(--focus))]",
          )}
        >
          {current?.icon && <span className="flex shrink-0 items-center">{current.icon}</span>}
          <span className={cn("min-w-0 flex-1 truncate", current ? "text-foreground" : "text-muted/70")}>
            {current?.label ?? placeholder}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) =>
        shown.length ? (
          shown.map((o) => (
            <MenuItem
              key={o.value}
              icon={o.icon}
              selected={o.value === value}
              onSelect={() => {
                onChange(o.value);
                close();
              }}
            >
              {o.label}
            </MenuItem>
          ))
        ) : (
          <p className="px-2.5 py-3 text-center text-xs text-muted">{emptyLabel}</p>
        )
      }
    </Menu>
  );
}
