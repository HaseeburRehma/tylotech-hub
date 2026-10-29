import { PROVIDER_BY_ID, type LeadProvider, type LeadProviderId } from "@/lib/lead-providers";
import { cn } from "@/lib/utils";
import { BRAND_PATHS } from "./brand-paths";

/** An integration's mark: the brand symbol (white on its colour) or a letter tile. */
export function ProviderLogo({ provider, size = 36, className }: { provider: LeadProvider | LeadProviderId; size?: number; className?: string }) {
  const p = typeof provider === "string" ? PROVIDER_BY_ID.get(provider) : provider;
  if (!p) return null;
  const brand = p.logo.brand ? BRAND_PATHS[p.logo.brand] : null;
  const hex = brand?.hex ?? p.logo.hex;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[28%] shadow-sm ring-1 ring-black/5", className)}
      style={{ width: size, height: size, background: hex }}
    >
      {brand ? (
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="#fff">
          <path d={brand.path} />
        </svg>
      ) : (
        <span className="font-display font-bold leading-none text-white" style={{ fontSize: size * (p.logo.letter && p.logo.letter.length > 1 ? 0.32 : 0.5) }}>
          {p.logo.letter}
        </span>
      )}
    </span>
  );
}
