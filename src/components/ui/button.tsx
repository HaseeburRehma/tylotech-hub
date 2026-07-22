"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium ring-focus transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-foreground shadow-glow hover:brightness-110",
        secondary:
          "border border-border bg-surface-2 text-foreground hover:border-brand/40 hover:bg-surface-2/70",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        outline:
          "border border-brand/40 text-brand hover:bg-brand/10",
        danger: "bg-danger/15 text-danger hover:bg-danger/25",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
