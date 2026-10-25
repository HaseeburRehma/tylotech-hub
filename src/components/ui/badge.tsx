import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badge = cva(
  // Figma status chip: small tinted pill, 11px.
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption font-medium leading-4",
  {
    variants: {
      variant: {
        // Text stays dark: light brand colours (gold, neon green) are unreadable as text.
        brand: "bg-brand/15 text-foreground",
        neutral: "bg-surface-2 text-muted",
        success: "bg-success/15 text-success",
        positive: "bg-positive/10 text-positive",
        warning: "bg-warning/15 text-warning",
        danger: "bg-danger/15 text-danger",
        info: "bg-info/15 text-info",
        outline: "border border-border text-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}
