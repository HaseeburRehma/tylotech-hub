import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-xs font-semibold text-brand ring-1 ring-border",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  );
}
