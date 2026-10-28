"use client";

import { AlertTriangle, ChevronDown, ChevronRight, ImageOff, Megaphone, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Card } from "@/components/ui/card";
import { useIntlLocale, useT } from "@/lib/i18n/provider";
import type { CampaignRow, GroupKind } from "@/lib/campaign-classify";
import { cn } from "@/lib/utils";

const KIND_BADGE: Record<GroupKind, { label: string; cls: string }> = {
  meta: { label: "Meta", cls: "bg-[#1877F2]/15 text-[#5b9bff]" },
  google: { label: "Google", cls: "bg-[#34A853]/15 text-[#4cc46f]" },
  website_google: { label: "Website", cls: "bg-surface-2 text-muted" },
  website_meta: { label: "Website", cls: "bg-surface-2 text-muted" },
  website: { label: "Website", cls: "bg-surface-2 text-muted" },
  organic: { label: "Meta", cls: "bg-surface-2 text-muted" },
  manual: { label: "Manuell", cls: "bg-surface-2 text-muted" },
};

export function PlatformBadge({ kind }: { kind: GroupKind }) {
  const b = KIND_BADGE[kind];
  return <span className={cn("inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-caption font-semibold", b.cls)}>{b.label}</span>;
}

/** Creative thumbnail (or a quiet placeholder). */
export function AdThumb({ src, size = 32 }: { src: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted/60">
        <ImageOff className="h-3.5 w-3.5" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: size, height: size }} className="shrink-0 rounded-md object-cover" />;
}

export interface CampaignSelection {
  key: string;
  label: string;
  leadIds: string[];
}

/**
 * Leads by campaign and creative for the chosen period, with what each cost.
 * Click a campaign or ad to see only its leads below.
 */
export function CampaignPanel({
  rows,
  totals,
  currency,
  loading,
  errors,
  hasAds,
  selected,
  onSelect,
  integrationsHref,
}: {
  rows: CampaignRow[];
  totals: { spend: number; leads: number; platformLeads: number; cpl: number | null; unmatched: number };
  currency: string;
  loading: boolean;
  errors: { provider: string; error: string }[];
  hasAds: boolean;
  selected: CampaignSelection | null;
  onSelect: (s: CampaignSelection | null) => void;
  integrationsHref: string;
}) {
  const t = useT();
  const locale = useIntlLocale();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const money = (n: number | null) => (n == null ? "-" : n.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: n >= 100 ? 0 : 2 }));
  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Megaphone className="h-4 w-4 text-brand-ink" /> {t("leads.camp.title")}
        </h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {[
            [t("leads.camp.spend"), money(totals.spend)],
            [t("leads.camp.leads"), String(totals.leads)],
            [t("leads.camp.cpl"), money(totals.cpl)],
            [t("leads.camp.platformLeads"), String(Math.round(totals.platformLeads))],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold tabular-nums text-foreground">{loading && k !== t("leads.camp.leads") ? "…" : v}</dd>
            </div>
          ))}
        </dl>
        {selected && (
          <button type="button" onClick={() => onSelect(null)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand-ink hover:bg-brand/20">
            {t("leads.camp.filtered", { name: selected.label })} <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {errors.map((e) => (
        <p key={e.provider} className="flex items-start gap-2 border-b border-border bg-warning/10 px-4 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {e.provider === "meta_ads" ? "Meta Ads" : "Google Ads"}: {e.error}
        </p>
      ))}
      {!hasAds && !loading && (
        <p className="border-b border-border px-4 py-2 text-xs text-muted">
          {t("leads.camp.noAds")}{" "}
          <Link href={integrationsHref} className="font-medium text-brand-ink hover:underline">
            {t("leads.camp.toIntegrations")}
          </Link>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-eyebrow font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-semibold">{t("leads.camp.campaign")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("leads.camp.spend")}</th>
              <th className="px-3 py-2 text-right font-semibold" title={t("leads.camp.platformLeadsHelp")}>
                {t("leads.camp.platformLeads")}
              </th>
              <th className="px-3 py-2 text-right font-semibold">{t("leads.camp.leads")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("leads.camp.cpl")}</th>
              <th className="w-40 px-4 py-2 font-semibold">{t("leads.camp.share")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && !rows.length
              ? Array.from({ length: 3 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
                    </td>
                  </tr>
                ))
              : null}
            {!loading && !rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted">
                  {t("leads.camp.empty")}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isOpen = open.has(r.key);
              const isSel = selected?.key === r.key;
              return (
                <Fragment key={r.key}>
                  <tr className={cn("transition-colors hover:bg-surface-2/50", isSel && "bg-brand/5")}>
                    <td className="max-w-0 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggle(r.key)}
                          disabled={!r.ads.length}
                          aria-expanded={isOpen}
                          aria-label={t("leads.camp.showAds", { n: r.ads.length })}
                          className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:invisible"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <PlatformBadge kind={r.kind} />
                        <button
                          type="button"
                          onClick={() => onSelect(isSel ? null : { key: r.key, label: r.name, leadIds: r.leadIds })}
                          disabled={!r.leads}
                          className="min-w-0 truncate text-left font-medium text-foreground hover:text-brand-ink hover:underline disabled:no-underline disabled:hover:text-foreground"
                          title={r.name}
                        >
                          {r.name}
                        </button>
                        {!!r.ads.length && <span className="shrink-0 text-caption text-muted">{t("leads.camp.ads", { n: r.ads.length })}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.spend)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{r.platformLeads == null ? "-" : Math.round(r.platformLeads * 10) / 10}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.cpl)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(r.leads / maxLeads) * 100}%` }} />
                        </div>
                        <span className="w-9 text-right text-caption tabular-nums text-muted">{totals.leads ? Math.round((r.leads / totals.leads) * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                  {isOpen &&
                    r.ads.map((a) => {
                      const adSel = selected?.key === a.key;
                      return (
                        <tr key={a.key} className={cn("bg-surface-2/30 text-xs", adSel && "bg-brand/5")}>
                          <td className="max-w-0 py-2 pl-12 pr-4">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <AdThumb src={a.thumbnail} />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  disabled={!a.leads}
                                  onClick={() => onSelect(adSel ? null : { key: a.key, label: a.name, leadIds: a.leadIds })}
                                  className="block max-w-full truncate text-left font-medium text-foreground hover:text-brand-ink hover:underline disabled:no-underline disabled:hover:text-foreground"
                                  title={a.name}
                                >
                                  {a.name}
                                </button>
                                {a.adset && <span className="block truncate text-caption text-muted">{a.adset}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(a.spend)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted">{a.platformLeads == null ? "-" : Math.round(a.platformLeads * 10) / 10}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{a.leads}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(a.cpl)}</td>
                          <td />
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2 text-caption text-muted">{t("leads.camp.note")}</p>
    </Card>
  );
}
