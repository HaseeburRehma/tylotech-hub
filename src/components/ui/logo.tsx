"use client";

import { useTheme } from "@/lib/theme/theme-provider";
import { BrandTheme } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

function Mark({ theme, size = 32 }: { theme: BrandTheme; size?: number }) {
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
    default:
      return (
        <svg {...common}>
          <rect x="4" y="20" width="8" height="8" rx="1.5" fill="rgb(var(--brand))" opacity="0.45" />
          <rect x="4" y="12" width="8" height="8" rx="1.5" fill="rgb(var(--brand))" opacity="0.65" />
          <rect x="12" y="12" width="8" height="8" rx="1.5" fill="rgb(var(--brand))" opacity="0.85" />
          <rect x="12" y="4" width="8" height="8" rx="1.5" fill="rgb(var(--brand))" />
          <rect x="20" y="4" width="8" height="8" rx="1.5" fill="rgb(var(--brand))" opacity="0.65" />
        </svg>
      );
  }
}

export function Logo({
  size = 32,
  showName = true,
  className,
  invert,
}: {
  size?: number;
  showName?: boolean;
  className?: string;
  /** Invert the full logo to white for dark backgrounds */
  invert?: boolean;
}) {
  const { theme } = useTheme();

  if (showName && theme.fullLogo) {
    return (
      <div className={cn("flex items-center", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme.fullLogo}
          alt={theme.company}
          style={{ height: size, filter: invert ? "brightness(0) invert(1)" : undefined }}
          className={cn("w-auto object-contain", !invert && theme.fullLogoDark && "dark:hidden")}
        />
        {!invert && theme.fullLogoDark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.fullLogoDark}
            alt={theme.company}
            style={{ height: size }}
            className="hidden w-auto object-contain dark:block"
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Mark theme={theme} size={size} />
      {showName && (
        <span className={cn("text-[15px] font-semibold tracking-tight", invert ? "text-white" : "text-foreground")}>
          {theme.company}
        </span>
      )}
    </div>
  );
}
