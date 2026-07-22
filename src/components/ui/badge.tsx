import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badge = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        brand: "bg-brand/15 text-brand",
        neutral: "bg-surface-2 text-muted",
        success: "bg-success/15 text-success",
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
