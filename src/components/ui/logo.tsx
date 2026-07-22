"use client";

import { useTheme } from "@/lib/theme/theme-provider";
import { BrandTheme } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

function Mark({ theme, size = 32 }: { theme: BrandTheme; size?: number }) {
  // If a real logo url is uploaded, use it; otherwise render a generated brand mark.
  if (theme.logo.type === "url") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={theme.logo.value} alt={theme.company} width={size} height={size} className="rounded-lg" />;
  }

  const common = {
    width: size,
    height: size,
    viewBox: "0 0 40 40",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as const;

  switch (theme.logo.value) {
    case "nordic":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="10" fill="rgb(var(--brand) / 0.14)" />
          <path d="M12 28V12l16 16V12" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "velform":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="10" fill="rgb(var(--brand) / 0.14)" />
          <path d="M11 14l9 14 9-14M16 20h8" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default: // tylotech
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="10" fill="rgb(var(--brand) / 0.14)" />
          <path d="M10 13h20M20 13v15" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" />
          <circle cx="20" cy="13" r="2.4" fill="rgb(var(--brand))" />
        </svg>
      );
  }
}

export function Logo({
  size = 32,
  showName = true,
  className,
}: {
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Mark theme={theme} size={size} />
      {showName && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {theme.company}
        </span>
      )}
    </div>
  );
}
