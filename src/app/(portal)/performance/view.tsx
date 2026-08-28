"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PerfArea } from "@/components/charts/perf-area";
import { cn, formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Kpi, SeriesPoint } from "@/types";

const RANGES = ["7D", "30D", "90D", "YTD"];
const METRIC_KEYS: ("spend" | "leads" | "roas")[] = ["spend", "leads", "roas"];

function kpiValue(k: Kpi) {
  if (k.unit === "currency") return formatCurrency(k.value);
  if (k.unit === "ratio") return `${k.value.toFixed(1)}x`;
  if (k.unit === "percent") return `${k.value}%`;
  if (k.unit === "rank") return `#${k.value}`;
  return new Intl.NumberFormat("en").format(k.value);
}

export function PerformanceView({
  kpis,
  series,
  clients = [],
  selectedClientId = null,
  isStaff = false,
}: {
  kpis: Kpi[];
  series: SeriesPoint[];
  clients?: { id: string; company: string }[];
  selectedClientId?: string | null;
  isStaff?: boolean;
}) {
  const t = useT();
  const [range, setRange] = useState("30D");
  const [metric, setMetric] = useState<"spend" | "leads" | "roas">("spend");
  const hasData = kpis.length > 0 || series.length > 0;
  const metricLabel = (k: "spend" | "leads" | "roas") => (k === "spend" ? t("perf.adSpend") : k === "leads" ? "Leads" : "ROAS");
  const exportHref = selectedClientId ? `/api/reports/performance?client=${selectedClientId}` : "/api/reports/performance";

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
              href={`/performance?client=${c.id}`}
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

      {!hasData ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-foreground">{t("perf.noData")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("perf.noDataBody")}</p>
        </Card>
      ) : (
        <>
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kpis.slice(0, 4).map((k) => (
                <Card key={k.id} className="p-4">
                  <p className="text-xs text-muted">{k.label}</p>
                  <p className="mt-1.5 font-display text-xl font-semibold">{kpiValue(k)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{k.source}</p>
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
              <div className="flex rounded-xl border border-border bg-surface-2 p-1">
                {METRIC_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setMetric(k)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      metric === k ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
                    )}
                  >
                    {metricLabel(k)}
                  </button>
                ))}
              </div>
            </CardHeader>
            {series.length > 0 ? (
              <PerfArea data={series} keys={[metric]} />
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted">
                {t("perf.noSeries")}
              </div>
            )}
          </Card>

          {kpis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("perf.metricsDetail")}</CardTitle>
                <Badge variant="outline">{t("perf.metricsCount", { n: kpis.length })}</Badge>
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
                    {kpis.map((k) => (
                      <tr key={k.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 font-medium text-foreground">{k.label}</td>
                        <td className="py-3 text-muted">{k.source}</td>
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
