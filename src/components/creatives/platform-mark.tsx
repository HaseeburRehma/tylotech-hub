import { BRAND_PATHS } from "@/components/leads/brand-paths";
import { PLATFORM_LABEL, type Platform } from "@/lib/creatives";
import { cn } from "@/lib/utils";

const MARK: Partial<Record<Platform, string>> = { instagram: "instagram", facebook: "facebook", tiktok: "tiktok", linkedin: "linkedin", google: "googleads" };
const TILE: Record<Platform, { hex: string; letter: string }> = {
  instagram: { hex: "#FF0069", letter: "IG" },
  facebook: { hex: "#0866FF", letter: "f" },
  tiktok: { hex: "#000000", letter: "TT" },
  linkedin: { hex: "#0A66C2", letter: "in" },
  youtube: { hex: "#FF0000", letter: "YT" },
  google: { hex: "#4285F4", letter: "G" },
  pinterest: { hex: "#E60023", letter: "P" },
  snapchat: { hex: "#FFC400", letter: "S" },
  x: { hex: "#000000", letter: "X" },
  website: { hex: "#64748B", letter: "W" },
};

/** A platform's mark: its brand symbol where we have one, else a letter tile in its colour. */
export function PlatformMark({ platform, size = 16, className }: { platform: Platform; size?: number; className?: string }) {
  const brand = MARK[platform] ? BRAND_PATHS[MARK[platform]!] : null;
  const tile = TILE[platform];
  return (
    <span
      title={PLATFORM_LABEL[platform]}
      aria-label={PLATFORM_LABEL[platform]}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[28%] ring-1 ring-black/5", className)}
      style={{ width: size, height: size, background: brand?.hex ?? tile.hex }}
    >
      {brand ? (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="#fff" aria-hidden>
          <path d={brand.path} />
        </svg>
      ) : (
        <span aria-hidden className="font-display font-bold leading-none" style={{ fontSize: size * (tile.letter.length > 1 ? 0.38 : 0.55), color: platform === "snapchat" ? "#000" : "#fff" }}>
          {tile.letter}
        </span>
      )}
    </span>
  );
}
