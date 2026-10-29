"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/provider";
import type { Lead, LeadStatus } from "@/lib/leads-shared";
import { cn } from "@/lib/utils";

export const STATUS_VARIANT: Record<LeadStatus, "info" | "neutral" | "warning" | "brand" | "success" | "danger" | "outline"> = {
  new: "info",
  contacted: "neutral",
  not_reached: "warning",
  appointment_set: "brand",
  appointment_done: "brand",
  offer_sent: "info",
  won: "success",
  lost: "danger",
  invalid: "outline",
};

export const SOURCE_NAME: Record<string, string> = { meta: "Meta", google_ads: "Google Ads", webhook: "Website", manual: "", import: "Import" };

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

/** "5 min ago". Pass the page's clock (`now`) so server and browser render the same text. */
export function since(iso: string, t: (k: string, v?: Record<string, string | number>) => string, now: number = Date.now()) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 60) return t("leads.ago.min", { n: Math.max(1, m) });
  const h = Math.round(m / 60);
  if (h < 48) return t("leads.ago.h", { n: h });
  return t("leads.ago.d", { n: Math.round(h / 24) });
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const t = useT();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`leads.status.${status}`)}</Badge>;
}

export function SourceBadge({ lead }: { lead: Pick<Lead, "source" | "platform"> }) {
  const t = useT();
  const name = lead.source === "meta" && lead.platform === "instagram" ? "Instagram" : lead.source === "meta" ? "Facebook" : SOURCE_NAME[lead.source] || t("leads.source.manual");
  const color = lead.source === "meta" ? "bg-[#1877F2]/15 text-[#5b9bff]" : lead.source === "google_ads" ? "bg-[#34A853]/15 text-[#4cc46f]" : "bg-surface-2 text-muted";
  return <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-caption font-semibold", color)}>{name}</span>;
}

/** Color of a source label: finished green, partial amber, anonymous grey, retreat / application violet. */
export function tagClass(tag: string) {
  if (/anonym/i.test(tag)) return "bg-surface-2 text-muted";
  if (/vollst|complete/i.test(tag)) return "bg-success/15 text-success";
  if (/teil|partial/i.test(tag)) return "bg-warning/15 text-warning";
  if (/retreat|bewerbung|application/i.test(tag)) return "bg-[#8B5CF6]/15 text-[#8B5CF6]";
  return "bg-surface-2 text-foreground";
}

/** Labels from the source ("Vollständig", "Teil-Lead", "Retreat"). */
export function LeadTags({ tags, max }: { tags?: string[] | null; max?: number }) {
  if (!tags?.length) return null;
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <>
      {shown.map((tag) => (
        <span
          key={tag}
          className={cn(
            "inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-caption font-medium",
            tagClass(tag),
          )}
        >
          {tag}
        </span>
      ))}
    </>
  );
}
