"use client";

import { cn } from "@/lib/utils";

const SIZES = {
  md: { track: "h-6 w-11", knob: "h-5 w-5", on: "translate-x-[22px]" },
  sm: { track: "h-5 w-9", knob: "h-4 w-4", on: "translate-x-[18px]" },
};

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors ring-focus disabled:cursor-not-allowed disabled:opacity-60",
        s.track,
        checked ? "bg-brand" : "bg-border",
      )}
    >
      <span className={cn("inline-block rounded-full bg-white shadow transition-transform", s.knob, checked ? s.on : "translate-x-0.5")} />
    </button>
  );
}
