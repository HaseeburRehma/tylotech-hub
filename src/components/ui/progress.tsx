import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "success" | "warning" | "info" | "slate" | "positive" | "negative" | "muted";
}) {
  const bg = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    info: "bg-info",
    slate: "bg-positive/45",
    positive: "bg-positive",
    negative: "bg-negative",
    muted: "bg-muted/40",
  }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700", bg)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
