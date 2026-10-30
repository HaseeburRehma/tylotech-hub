import { BRAND_PATHS } from "@/components/leads/brand-paths";
import type { CreativeSourceProvider } from "@/lib/creatives";
import { cn } from "@/lib/utils";

const MARK: Record<CreativeSourceProvider, string> = { google_drive: "googledrive", dropbox: "dropbox", onedrive: "onedrive" };
export const SOURCE_NAME: Record<CreativeSourceProvider, string> = { google_drive: "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive / SharePoint" };

/** A cloud provider's mark, white on its colour. */
export function SourceLogo({ provider, size = 32, className }: { provider: CreativeSourceProvider; size?: number; className?: string }) {
  const b = BRAND_PATHS[MARK[provider]];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-[28%] shadow-sm ring-1 ring-black/5", className)} style={{ width: size, height: size, background: b.hex }}>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="#fff">
        <path d={b.path} />
      </svg>
    </span>
  );
}
