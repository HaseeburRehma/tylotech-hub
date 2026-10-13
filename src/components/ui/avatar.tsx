"use client";

import { useState } from "react";
import { useLogoTone } from "@/lib/logo-tone";
import { cn, initials } from "@/lib/utils";

/**
 * Person photo or company logo, falling back to initials when there is no
 * image or it fails to load. `logo` fits the image (wide wordmarks too) on a
 * rounded tile (white, or dark for light logos) instead of cropping it into a circle.
 */
export function Avatar({
  name,
  src,
  size = 36,
  logo = false,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  logo?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;
  // White-on-transparent logos would vanish on the white tile.
  const tone = useLogoTone(logo ? src : null);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden text-xs font-semibold ring-1 ring-border",
        logo && showImage ? cn("rounded-lg", tone === "light" ? "bg-[#18181b]" : "bg-white") : "rounded-full bg-brand/15 text-brand",
        className,
      )}
      style={{ width: size, height: size, padding: logo && showImage ? Math.max(2, Math.round(size * 0.12)) : undefined }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          onError={() => setFailed(true)}
          className={cn("h-full w-full", logo ? "object-contain" : "object-cover")}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
