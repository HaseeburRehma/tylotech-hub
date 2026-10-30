"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import type { CreativeSourceProvider } from "@/lib/creatives";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { SourceLogo, SOURCE_NAME } from "./source-logo";

const ORDER: CreativeSourceProvider[] = ["google_drive", "dropbox", "onedrive"];
const EXAMPLE: Record<CreativeSourceProvider, string> = {
  google_drive: "https://drive.google.com/drive/folders/…",
  dropbox: "https://www.dropbox.com/scl/fo/…  /Clients/Creatives",
  onedrive: "https://…sharepoint.com/:f:/…  https://1drv.ms/f/…",
};
const LINK_OK: Record<CreativeSourceProvider, RegExp> = {
  google_drive: /\/folders\/[a-zA-Z0-9_-]{10,}|[?&]id=[a-zA-Z0-9_-]{10,}|^[a-zA-Z0-9_-]{20,}$/,
  dropbox: /^https:\/\/([a-z0-9-]+\.)?dropbox\.com\/|^\//i,
  onedrive: /^https:\/\/([a-z0-9-]+\.)*(1drv\.ms|onedrive\.live\.com|onedrive\.com|sharepoint\.com)\//i,
};

/** Connect a Google Drive, Dropbox or OneDrive folder to one category (team only). */
export function ConnectModal({
  open,
  onClose,
  folderId,
  categoryLabel,
  ready,
}: {
  open: boolean;
  onClose: () => void;
  folderId: string | null;
  categoryLabel: string;
  ready: Record<CreativeSourceProvider, boolean>;
}) {
  const t = useT();
  const [provider, setProvider] = useState<CreativeSourceProvider>("google_drive");
  const [link, setLink] = useState("");
  const [going, setGoing] = useState(false);

  useEffect(() => {
    if (open) {
      setLink("");
      setGoing(false);
      setProvider(ORDER.find((p) => ready[p]) ?? "google_drive");
    }
  }, [open, ready]);

  const valid = LINK_OK[provider].test(link.trim());
  const go = () => {
    if (!folderId || !valid || !ready[provider]) return;
    setGoing(true);
    const q = new URLSearchParams({ folderId, provider, link: link.trim() });
    window.location.href = `/api/creatives/sources?${q.toString()}`;
  };

  return (
    <ModalShell open={open} onClose={onClose} className="max-w-lg">
      <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold">{t("cr.connect.title")}</h2>
          <p className="mt-0.5 text-body-sm text-muted">{t("cr.connect.sub", { category: categoryLabel })}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              aria-pressed={provider === p}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors sm:flex-col sm:items-start",
                provider === p ? "border-brand bg-brand/[0.06]" : "border-line hover:border-brand/40",
              )}
            >
              <SourceLogo provider={p} size={30} />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{SOURCE_NAME[p]}</span>
                {!ready[p] && <span className="block text-caption text-muted">{t("cr.connect.setup")}</span>}
              </span>
            </button>
          ))}
        </div>

        {ready[provider] ? (
          <>
            <div>
              <label htmlFor="cr-link" className="mb-1.5 block text-caption font-medium text-muted">
                {t(`cr.connect.link.${provider}`)}
              </label>
              <Input id="cr-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder={EXAMPLE[provider]} onKeyDown={(e) => e.key === "Enter" && go()} autoComplete="off" spellCheck={false} />
              {link.trim() && !valid && <p className="mt-1.5 text-caption text-danger">{t("cr.connect.badLink")}</p>}
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-caption text-muted">
              <li>{t(`cr.connect.step1.${provider}`)}</li>
              <li>{t("cr.connect.step2")}</li>
              <li>{t("cr.connect.step3")}</li>
            </ol>
          </>
        ) : (
          <div className="rounded-xl bg-surface-2/60 px-4 py-3 text-body-sm text-muted">
            <p className="font-medium text-foreground">{t("cr.connect.notReady", { name: SOURCE_NAME[provider] })}</p>
            <p className="mt-1">{t(`cr.connect.notReady.${provider}`)}</p>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={go} loading={going} disabled={!valid || !ready[provider] || going}>
          <ExternalLink className="h-4 w-4" />
          {t("cr.connect.go", { name: SOURCE_NAME[provider] })}
        </Button>
      </div>
    </ModalShell>
  );
}
