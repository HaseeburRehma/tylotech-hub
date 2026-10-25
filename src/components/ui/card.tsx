import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  hover,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn("card p-5", hover && "card-hover", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-center justify-between gap-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-title font-semibold leading-5 tracking-[-0.015em] text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

/**
 * Figma "Panel": a card whose header sits on its own row above a hairline,
 * with the body flush to the edges (tables, boards, charts).
 */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("card overflow-hidden", className)} {...props} />;
}

export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 border-b border-line py-3 pl-5 pr-4", className)}>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-title font-semibold leading-5 tracking-[-0.015em] text-foreground sm:truncate">{title}</h3>
        {/* Wraps on phones, one line from sm up. */}
        {subtitle && <p className="mt-0.5 text-xs text-muted sm:truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 text-body-sm font-medium text-soft">{action}</div>}
    </div>
  );
}
