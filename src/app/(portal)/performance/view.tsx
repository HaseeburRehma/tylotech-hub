"use client";

import { AlertTriangle, Download, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PerfArea } from "@/components/charts/perf-area";
import { cn, formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { IntegrationProvider } from "@/lib/integrations/providers";
import type { ProviderSeriesPoint } from "@/lib/data";
import type { Kpi, SeriesPoint } from "@/types";

export interface SourceStatus {
  connected: boolean;
  lastSyncedAt: string | null;
}

type MetricKey = "spend" | "leads" | "roas";
type Agg = "sum" | "avg";

interface MetricDef {
  key: MetricKey;
  label: string;
  metricName: string;
  agg: Agg;
  unit: "currency" | "number" | "ratio";
}

const RANGES: { id: string; label: string; days: number | "ytd" }[] = [
  { id: "7D", label: "7D", days: 7 },
  { id: "30D", label: "30D", days: 30 },
  { id: "90D", label: "90D", days: 90 },
  { id: "YTD", label: "YTD", days: "ytd" },
];

// What each source's own trend chart is actually plotting — the shared
// {spend,leads,roas} shape is repurposed per source (e.g. Search Console's
// "roas" column holds daily impressions, not return-on-ad-spend), so the
// available metrics, their kpis-table metric_name, and how to aggregate them
// across days (sum a count, average a ratio) all vary by source.
const SOURCE_METRICS: Record<string, MetricDef[]> = {
  all: [
    { key: "spend", label: "Ad Spend", metricName: "ad_spend", agg: "sum", unit: "currency" },
    { key: "leads", label: "Leads", metricName: "leads", agg: "sum", unit: "number" },
    { key: "roas", label: "ROAS", metricName: "roas", agg: "avg", unit: "ratio" },
  ],
  meta_ads: [
    { key: "spend", label: "Ad Spend", metricName: "ad_spend", agg: "sum", unit: "currency" },
    { key: "leads", label: "Leads", metricName: "leads", agg: "sum", unit: "number" },
    { key: "roas", label: "ROAS", metricName: "roas", agg: "avg", unit: "ratio" },
  ],
  google_ads: [
    { key: "spend", label: "Ad Spend", metricName: "ad_spend", agg: "sum", unit: "currency" },
    { key: "leads", label: "Conversions", metricName: "leads", agg: "sum", unit: "number" },
    { key: "roas", label: "ROAS", metricName: "roas", agg: "avg", unit: "ratio" },
  ],
  search_console: [
    { key: "leads", label: "Clicks", metricName: "clicks", agg: "sum", unit: "number" },
    { key: "roas", label: "Impressions", metricName: "impressions", agg: "sum", unit: "number" },
  ],
  ga4: [
    { key: "leads", label: "Users", metricName: "users", agg: "sum", unit: "number" },
    { key: "roas", label: "Sessions", metricName: "sessions", agg: "sum", unit: "number" },
  ],
};

// Only meta_ads/google_ads use the "roas" column for its real meaning (return
// on ad spend) — GA4 and Search Console repurpose that same column for daily
// sessions/impressions. Averaging those into a combined "ROAS" would produce
// a meaningless blended number, so the combined view only draws roas from ad
// sources.
const ROAS_PROVIDERS = new Set(["meta_ads", "google_ads"]);

function fmtNumber(n: number) {
  return new Intl.NumberFormat("en").format(Math.round(n));
}

function fmtByUnit(n: number, unit: MetricDef["unit"]) {
  if (unit === "currency") return formatCurrency(n);
  if (unit === "ratio") return `${n.toFixed(2)}x`;
  return fmtNumber(n);
}

function kpiValue(k: Kpi) {
  if (k.unit === "currency") return formatCurrency(k.value);
  if (k.unit === "ratio") return `${k.value.toFixed(1)}x`;
  if (k.unit === "percent") return `${k.value}%`;
  if (k.unit === "rank") return `#${k.value}`;
  return fmtNumber(k.value);
}

function combineSeries(points: ProviderSeriesPoint[]): (SeriesPoint & { provider?: string })[] {
  const byDate = new Map<string, { spend: number; leads: number; roasTotal: number; roasCount: number }>();
  for (const p of points) {
    const cur = byDate.get(p.date) ?? { spend: 0, leads: 0, roasTotal: 0, roasCount: 0 };
    cur.spend += p.spend;
    cur.leads += p.leads;
    if (p.roas && ROAS_PROVIDERS.has(p.provider)) {
      cur.roasTotal += p.roas;
      cur.roasCount += 1;
    }
    byDate.set(p.date, cur);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      spend: v.spend,
      leads: v.leads,
      roas: v.roasCount ? Number((v.roasTotal / v.roasCount).toFixed(2)) : 0,
    }));
}

function daysAgo(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function rangeDayCount(days: number | "ytd", anchorDate: string) {
  if (days !== "ytd") return days;
  const anchor = new Date(anchorDate + "T00:00:00Z");
  const jan1 = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1));
  return Math.floor((anchor.getTime() - jan1.getTime()) / 86_400_000) + 1;
}

function aggregate(points: SeriesPoint[], key: MetricKey, agg: Agg) {
  const values = points.map((p) => p[key]).filter((v) => v !== undefined) as number[];
  if (!values.length) return 0;
  const total = values.reduce((a, v) => a + v, 0);
  return agg === "avg" ? total / values.length : total;
}

function StaleBadge({ status, t }: { status: SourceStatus | undefined; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (!status || status.connected) return null;
  const since = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleDateString("en-DE", { day: "numeric", month: "short" })
    : null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger"
      title={since ? t("perf.staleSince", { date: since }) : t("perf.staleNoSync")}
    >
      <AlertTriangle className="h-2.5 w-2.5" /> {t("perf.stale")}
    </span>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-xs text-muted/60">{"—"}</span>;
  }
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-success" : "text-danger")}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

export function PerformanceView({
  kpis,
  series,
  clients = [],
  selectedClientId = null,
  isStaff = false,
  sourceStatus = {},
  providers = [],
}: {
  kpis: Kpi[];
  series: ProviderSeriesPoint[];
  clients?: { id: string; company: string; slug: string | null }[];
  selectedClientId?: string | null;
  isStaff?: boolean;
  sourceStatus?: Record<string, SourceStatus>;
  providers?: IntegrationProvider[];
}) {
  const t = useT();
  const [range, setRange] = useState("30D");
  const [source, setSource] = useState("all");
  const [metric, setMetric] = useState<MetricKey>("spend");

  const hasAnyData = kpis.length > 0 || series.length > 0;
  const exportHref = selectedClientId ? `/api/reports/performance?client=${selectedClientId}` : "/api/reports/performance";

  const sourceOptions = useMemo(
    () => [{ id: "all", name: t("perf.allSources") }, ...providers.map((p) => ({ id: p.id, name: p.name }))],
    [providers, t],
  );

  const filteredKpis = useMemo(() => {
    if (source === "all") return kpis;
    const provider = providers.find((p) => p.id === source);
    if (!provider) return kpis;
    return kpis.filter((k) => k.source === provider.name);
  }, [kpis, providers, source]);

  // Full, un-range-filtered daily series for the selected source — kept
  // around so a prior-period comparison always has real history to diff
  // against, even when the visible chart is zoomed into the last 7 days.
  const fullSeries = useMemo<SeriesPoint[]>(() => {
    if (source === "all") return combineSeries(series);
    return series.filter((p) => p.provider === source).map(({ provider: _provider, ...rest }) => rest);
  }, [series, source]);

  const metricOptions = SOURCE_METRICS[source] ?? SOURCE_METRICS.all;
  const activeMetric: MetricKey = metricOptions.some((m) => m.key === metric) ? metric : metricOptions[0]?.key ?? "spend";
  const activeDef = metricOptions.find((m) => m.key === activeMetric);

  const rangeDef = RANGES.find((r) => r.id === range) ?? RANGES[1];
  const anchorDate = fullSeries.length ? fullSeries[fullSeries.length - 1].date : null;
  const dayCount = anchorDate ? rangeDayCount(rangeDef.days, anchorDate) : 0;

  // Slice the full series into "currently visible" and "the equal-length
  // period right before it" — both derived from data already loaded, no
  // extra fetch. The chart plots the former; the latter is only used to
  // compute a real % change, never rendered.
  const { currentPeriod, previousPeriod } = useMemo(() => {
    if (!anchorDate || !dayCount) return { currentPeriod: [] as SeriesPoint[], previousPeriod: [] as SeriesPoint[] };
    const curStart = daysAgo(anchorDate, dayCount - 1);
    const prevEnd = daysAgo(curStart, 1);
    const prevStart = daysAgo(prevEnd, dayCount - 1);
    return {
      currentPeriod: fullSeries.filter((p) => p.date >= curStart && p.date <= anchorDate),
      previousPeriod: fullSeries.filter((p) => p.date >= prevStart && p.date <= prevEnd),
    };
  }, [fullSeries, anchorDate, dayCount]);

  const chartLabels = Object.fromEntries(metricOptions.map((m) => [m.key, m.label])) as Partial<Record<MetricKey, string>>;

  // Metrics that have real day-by-day history behind them get a range-aware
  // card (total for the selected window + a real delta vs the prior window).
  // Everything else (e.g. Avg. Position, Cost per Lead) has no daily series
  // to derive that from, so it stays a plain last-sync snapshot — shown
  // separately rather than faking a range or a delta for it.
  const seriesBackedNames = useMemo(() => new Set(metricOptions.map((m) => m.metricName)), [metricOptions]);
  const seriesBackedKpis = filteredKpis.filter((k) => seriesBackedNames.has(k.metric_name));
  const snapshotKpis = filteredKpis.filter((k) => !seriesBackedNames.has(k.metric_name));

  const metricStats = (def: MetricDef) => {
    const total = aggregate(currentPeriod, def.key, def.agg);
    const prevTotal = aggregate(previousPeriod, def.key, def.agg);
    const delta = previousPeriod.length && prevTotal !== 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
    const peak = currentPeriod.reduce<SeriesPoint | null>(
      (best, p) => (best === null || p[def.key] > best[def.key] ? p : best),
      null,
    );
    const avgPerDay = currentPeriod.length ? total / (def.agg === "sum" ? currentPeriod.length : 1) : 0;
    return { total, delta, peak, avgPerDay };
  };

  const sourceHasData = filteredKpis.length > 0 || fullSeries.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("perf.title")} subtitle={t("perf.subtitle")}>
        <div className="flex rounded-xl border border-border bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                range === r.id ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => window.open(exportHref, "_blank")}>
          <Download className="h-4 w-4" />
          {t("perf.exportPdf")}
        </Button>
      </PageHeader>

      {isStaff && clients.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t("perf.viewingFor")}</span>
          {clients.map((c) => (
            <a
              key={c.id}
              href={`/performance?client=${c.slug ?? c.id}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                c.id === selectedClientId
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {c.company}
            </a>
          ))}
        </div>
      )}

      {hasAnyData && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t("perf.source")}:</span>
          {sourceOptions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                s.id === source
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!hasAnyData ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-foreground">{t("perf.noData")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("perf.noDataBody")}</p>
        </Card>
      ) : !sourceHasData ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("perf.noSourceData", { source: sourceOptions.find((s) => s.id === source)?.name ?? source })}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("perf.noSourceDataBody")}</p>
        </Card>
      ) : (
        <>
          {/* Range-aware cards: one per metric with real daily history, each
              showing the total for the selected window and a genuine
              period-over-period delta — not a repeat of the chart, and not
              a fake percentage. */}
          {seriesBackedKpis.length > 0 && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {metricOptions.map((def) => {
                const matches = seriesBackedKpis.filter((row) => row.metric_name === def.metricName);
                if (!matches.length) return null;
                // "All sources" can have this same metric_name from more than
                // one provider (e.g. leads from both Meta and Google Ads) —
                // the total is already correctly combined via fullSeries, so
                // just be honest about which sources fed it instead of
                // arbitrarily attributing it to whichever one sorts first.
                const sourceLabel = Array.from(new Set(matches.map((k) => k.source))).join(" + ");
                const { total, delta } = metricStats(def);
                return (
                  <Card key={def.key} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted">{def.label}</p>
                      <DeltaBadge delta={delta} />
                    </div>
                    <p className="mt-1.5 font-display text-xl font-semibold">{fmtByUnit(total, def.unit)}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="text-[11px] text-muted">{sourceLabel} · {range}</p>
                      {matches.length === 1 && <StaleBadge status={sourceStatus[matches[0].source]} t={t} />}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Snapshot cards: metrics with no daily history behind them
              (e.g. Avg. Position, Cost per Lead) — a last-sync value only,
              honestly labeled instead of pretending it's range-adjustable. */}
          {snapshotKpis.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted">{t("perf.snapshotLabel")}</p>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {snapshotKpis.map((k) => (
                  <Card key={k.id} className="p-4">
                    <p className="text-xs text-muted">{k.label}</p>
                    <p className="mt-1.5 font-display text-xl font-semibold">{kpiValue(k)}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="text-[11px] text-muted">{k.source} · {k.period}</p>
                      <StaleBadge status={sourceStatus[k.source]} t={t} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("perf.trend")}</CardTitle>
                <p className="mt-0.5 text-xs text-muted">
                  {range} · {t("perf.byDay")}
                </p>
              </div>
              {metricOptions.length > 1 && (
                <div className="flex rounded-xl border border-border bg-surface-2 p-1">
                  {metricOptions.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setMetric(key)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        activeMetric === key ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>
            {currentPeriod.length > 0 ? (
              <>
                <PerfArea data={currentPeriod} keys={[activeMetric]} labels={chartLabels} />
                {activeDef && (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted">
                    {(() => {
                      const { peak, avgPerDay } = metricStats(activeDef);
                      return (
                        <>
                          <span>
                            {t("perf.dailyAvg")}: <span className="font-medium text-foreground">{fmtByUnit(avgPerDay, activeDef.unit)}</span>
                          </span>
                          {peak && (
                            <span>
                              {t("perf.peakDay")}:{" "}
                              <span className="font-medium text-foreground">
                                {new Date(peak.date).toLocaleDateString("en-DE", { day: "numeric", month: "short" })} ·{" "}
                                {fmtByUnit(peak[activeDef.key], activeDef.unit)}
                              </span>
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted">{t("perf.noSeries")}</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
