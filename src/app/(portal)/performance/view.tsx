"use client";

import { AlertTriangle, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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

const RANGES = ["7D", "30D", "90D", "YTD"];

// What each source's own trend chart is actually plotting — the shared
// {spend,leads,roas} shape is repurposed per source (e.g. Search Console's
// "leads" column holds daily organic clicks, not sales leads), so the
// available metrics and their display labels vary by source.
const SOURCE_METRICS: Record<string, { key: MetricKey; label: string }[]> = {
  all: [
    { key: "spend", label: "Ad Spend" },
    { key: "leads", label: "Leads" },
    { key: "roas", label: "ROAS" },
  ],
  meta_ads: [
    { key: "spend", label: "Ad Spend" },
    { key: "leads", label: "Leads" },
    { key: "roas", label: "ROAS" },
  ],
  google_ads: [
    { key: "spend", label: "Ad Spend" },
    { key: "leads", label: "Conversions" },
    { key: "roas", label: "ROAS" },
  ],
  search_console: [{ key: "leads", label: "Clicks" }],
  ga4: [{ key: "leads", label: "Users" }],
};

function kpiValue(k: Kpi) {
  if (k.unit === "currency") return formatCurrency(k.value);
  if (k.unit === "ratio") return `${k.value.toFixed(1)}x`;
  if (k.unit === "percent") return `${k.value}%`;
  if (k.unit === "rank") return `#${k.value}`;
  return new Intl.NumberFormat("en").format(k.value);
}

function combineSeries(points: ProviderSeriesPoint[]): SeriesPoint[] {
  const byDate = new Map<string, { spend: number; leads: number; roasTotal: number; roasCount: number }>();
  for (const p of points) {
    const cur = byDate.get(p.date) ?? { spend: 0, leads: 0, roasTotal: 0, roasCount: 0 };
    cur.spend += p.spend;
    cur.leads += p.leads;
    if (p.roas) {
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

  const chartSeries = useMemo(() => {
    if (source === "all") return combineSeries(series);
    return series.filter((p) => p.provider === source).map(({ provider: _provider, ...rest }) => rest);
  }, [series, source]);

  const metricOptions = SOURCE_METRICS[source] ?? SOURCE_METRICS.all;
  const activeMetric: MetricKey = metricOptions.some((m) => m.key === metric) ? metric : metricOptions[0].key;
  const metricLabel = (k: MetricKey) => metricOptions.find((m) => m.key === k)?.label ?? k;
  const chartLabels = Object.fromEntries(metricOptions.map((m) => [m.key, m.label])) as Partial<Record<MetricKey, string>>;

  const sourceHasData = filteredKpis.length > 0 || chartSeries.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("perf.title")} subtitle={t("perf.subtitle")}>
        <div className="flex rounded-xl border border-border bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                range === r ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {r}
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
          {filteredKpis.length > 0 && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {filteredKpis.slice(0, 4).map((k) => (
                <Card key={k.id} className="p-4">
                  <p className="text-xs text-muted">{k.label}</p>
                  <p className="mt-1.5 font-display text-xl font-semibold">{kpiValue(k)}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-[11px] text-muted">{k.source}</p>
                    <StaleBadge status={sourceStatus[k.source]} t={t} />
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>{t("perf.trend")}</CardTitle>
                <p className="mt-0.5 text-xs text-muted">{range} · {t("perf.byDay")}</p>
              </div>
              {metricOptions.length > 1 && (
                <div className="flex rounded-xl border border-border bg-surface-2 p-1">
                  {metricOptions.map(({ key }) => (
                    <button
                      key={key}
                      onClick={() => setMetric(key)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        activeMetric === key ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
                      )}
                    >
                      {metricLabel(key)}
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>
            {chartSeries.length > 0 ? (
              <PerfArea data={chartSeries} keys={[activeMetric]} labels={chartLabels} />
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted">
                {t("perf.noSeries")}
              </div>
            )}
          </Card>

          {filteredKpis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("perf.metricsDetail")}</CardTitle>
                <Badge variant="outline">{t("perf.metricsCount", { n: filteredKpis.length })}</Badge>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="pb-3 font-medium">{t("perf.metric")}</th>
                      <th className="pb-3 font-medium">{t("perf.source")}</th>
                      <th className="pb-3 font-medium">{t("perf.value")}</th>
                      <th className="pb-3 text-right font-medium">{t("perf.delta")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKpis.map((k) => (
                      <tr key={k.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 font-medium text-foreground">{k.label}</td>
                        <td className="py-3 text-muted">
                          <span className="inline-flex items-center gap-1.5">
                            {k.source}
                            <StaleBadge status={sourceStatus[k.source]} t={t} />
                          </span>
                        </td>
                        <td className="py-3 text-muted">{kpiValue(k)}</td>
                        <td className={cn("py-3 text-right font-semibold", k.delta >= 0 ? "text-success" : "text-danger")}>
                          {k.delta > 0 ? "+" : ""}{k.delta}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
