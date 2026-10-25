"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium ring-focus transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] whitespace-nowrap",
  {
    variants: {
      variant: {
        // Brand fill with the Figma top-light / bottom-shade sheen (works for any white-label color).
        primary:
          "bg-brand bg-gradient-to-b from-white/20 to-black/10 font-display font-semibold text-brand-foreground shadow-card hover:brightness-105",
        secondary:
          "border border-border bg-surface text-foreground shadow-card hover:border-brand/40 hover:bg-surface-2/60",
        ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
        outline:
          "border border-border bg-surface text-foreground shadow-card hover:border-brand/50 hover:text-foreground",
        danger: "bg-danger/15 text-danger hover:bg-danger/25",
        // Final step of a destructive confirmation.
        destructive: "bg-danger text-white shadow-card hover:brightness-95",
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

/**
 * A link that looks like a Button — use instead of <Link><Button/></Link>
 * (a button inside a link is invalid and gives two tab stops). Disabled renders
 * an inert span so the click can't fall through to the URL.
 */
export function ButtonLink({
  href,
  variant,
  size,
  className,
  disabled,
  children,
  prefetch,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof button> & { href: string; disabled?: boolean; prefetch?: boolean }) {
  const cls = cn(button({ variant, size }), className);
  if (disabled) return <span aria-disabled="true" className={cn(cls, "pointer-events-none opacity-50")}>{children}</span>;
  // API routes (OAuth starts, downloads) and absolute URLs need a full navigation.
  if (/^(https?:|mailto:|\/api\/)/.test(href) || rest.download !== undefined) {
    return <a href={href} className={cls} {...rest}>{children}</a>;
  }
  return <Link href={href} prefetch={prefetch} className={cls} {...rest}>{children}</Link>;
}
