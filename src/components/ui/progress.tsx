import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "success" | "warning" | "info";
}) {
  const bg = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    info: "bg-info",
  }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700", bg)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
