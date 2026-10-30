"use client";

import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/creatives";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { PlatformMark } from "./platform-mark";

/** Platform toggles: where a creative runs. */
export function PlatformPicker({ value, onChange, disabled }: { value: Platform[]; onChange: (v: Platform[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLATFORMS.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption transition-colors disabled:opacity-50",
              on ? "border-brand bg-brand/[0.1] font-medium text-foreground" : "border-line text-muted hover:text-foreground",
            )}
          >
            <PlatformMark platform={p} size={14} />
            {PLATFORM_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

/** Campaign field with the partner's known campaigns as suggestions. */
export function CampaignInput({ value, onChange, campaigns, disabled, id }: { value: string; onChange: (v: string) => void; campaigns: string[]; disabled?: boolean; id?: string }) {
  const t = useT();
  const list = useId();
  return (
    <>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} list={list} maxLength={200} placeholder={t("cr.tag.campaignPh")} disabled={disabled} autoComplete="off" />
      <datalist id={list}>
        {campaigns.slice(0, 200).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

/** Set platforms and campaign on one or more creatives (team only). */
export function TagModal({
  open,
  onClose,
  count,
  initial,
  campaigns,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  initial: { platforms: Platform[]; campaign: string };
  campaigns: string[];
  onSave: (v: { platforms: Platform[]; campaign: string }) => Promise<void>;
}) {
  const t = useT();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [campaign, setCampaign] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlatforms(initial.platforms);
    setCampaign(initial.campaign);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ModalShell open={open} onClose={() => !saving && onClose()} className="max-w-md">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError(null);
          try {
            await onSave({ platforms, campaign });
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">{t("cr.tag.title")}</h2>
            <p className="mt-0.5 text-body-sm text-muted">{t("cr.tag.sub", { n: count })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="mb-2 text-caption font-medium text-muted">{t("cr.tag.platforms")}</p>
            <PlatformPicker value={platforms} onChange={setPlatforms} disabled={saving} />
          </div>
          <div>
            <label htmlFor="cr-tag-campaign" className="mb-1.5 block text-caption font-medium text-muted">
              {t("cr.tag.campaign")}
            </label>
            <CampaignInput id="cr-tag-campaign" value={campaign} onChange={setCampaign} campaigns={campaigns} disabled={saving} />
            <p className="mt-1.5 text-caption text-muted">{t("cr.tag.campaignHint")}</p>
          </div>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
