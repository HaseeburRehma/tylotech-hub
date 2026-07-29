"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PerfArea } from "@/components/charts/perf-area";
import { cn, formatCurrency } from "@/lib/utils";
import type { Kpi, SeriesPoint } from "@/types";

const RANGES = ["7D", "30D", "90D", "YTD"];
const METRICS: { key: "spend" | "leads" | "roas"; label: string }[] = [
  { key: "spend", label: "Ad Spend" },
  { key: "leads", label: "Leads" },
  { key: "roas", label: "ROAS" },
];

function kpiValue(k: Kpi) {
  if (k.unit === "currency") return formatCurrency(k.value);
  if (k.unit === "ratio") return `${k.value.toFixed(1)}x`;
  if (k.unit === "percent") return `${k.value}%`;
  if (k.unit === "rank") return `#${k.value}`;
  return new Intl.NumberFormat("en").format(k.value);
}

export function PerformanceView({ kpis, series }: { kpis: Kpi[]; series: SeriesPoint[] }) {
  const [range, setRange] = useState("30D");
  const [metric, setMetric] = useState<"spend" | "leads" | "roas">("spend");
  const hasData = kpis.length > 0 || series.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Performance" subtitle="Cross-channel results for Meta Ads, Google Ads & SEO.">
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
        <Button size="sm" variant="secondary" onClick={() => window.open("/api/reports/performance", "_blank")}>
          <Download className="h-4 w-4" />
          Export PDF
        </Button>
      </PageHeader>

      {!hasData ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-foreground">No performance data yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Once your TyloTech team connects your ad accounts, your metrics and trends will appear here.
          </p>
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
                <CardTitle>Trend</CardTitle>
                <p className="mt-0.5 text-xs text-muted">{range} · by day</p>
              </div>
              <div className="flex rounded-xl border border-border bg-surface-2 p-1">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      metric === m.key ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            {series.length > 0 ? (
              <PerfArea data={series} keys={[metric]} />
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted">
                No time-series data yet — connect an ad source on the Integrations page.
              </div>
            )}
          </Card>

          {kpis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Metrics detail</CardTitle>
                <Badge variant="outline">{kpis.length} metrics</Badge>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="pb-3 font-medium">Metric</th>
                      <th className="pb-3 font-medium">Source</th>
                      <th className="pb-3 font-medium">Value</th>
                      <th className="pb-3 text-right font-medium">Δ vs last period</th>
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
