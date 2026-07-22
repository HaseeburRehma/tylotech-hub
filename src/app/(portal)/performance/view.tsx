"use client";

import { Download, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Donut } from "@/components/charts/donut";
import { PerfArea } from "@/components/charts/perf-area";
import { CHANNEL_SPLIT } from "@/lib/mock/data";
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
  return new Intl.NumberFormat("en").format(k.value);
}

export function PerformanceView({ kpis, series }: { kpis: Kpi[]; series: SeriesPoint[] }) {
  const [range, setRange] = useState("30D");
  const [metric, setMetric] = useState<"spend" | "leads" | "roas">("spend");

  const tiles = kpis.slice(0, 4).map((k) => ({ label: k.label, value: kpiValue(k) }));

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
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.open("/api/reports/performance", "_blank")}
        >
          <Download className="h-4 w-4" />
          Export PDF
        </Button>
      </PageHeader>

      {/* summary tiles — live KPIs for this client */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1.5 font-display text-xl font-semibold">{t.value}</p>
          </Card>
        ))}
      </div>

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
        <PerfArea data={series} keys={[metric]} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Spend by channel</CardTitle>
          </CardHeader>
          <Donut data={CHANNEL_SPLIT} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Channel performance</CardTitle>
            <Badge variant="success" className="gap-1">
              <TrendingUp className="h-3 w-3" /> +18% MoM
            </Badge>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="pb-3 font-medium">Channel</th>
                  <th className="pb-3 font-medium">Spend</th>
                  <th className="pb-3 font-medium">Leads</th>
                  <th className="pb-3 font-medium">CPL</th>
                  <th className="pb-3 text-right font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { c: "Meta Ads", s: 18400, l: 198, cpl: 52, r: "4.9x" },
                  { c: "Google Ads", s: 13600, l: 102, cpl: 58, r: "4.2x" },
                  { c: "SEO", s: 4200, l: 34, cpl: 41, r: "6.1x" },
                  { c: "Email", s: 1800, l: 8, cpl: 38, r: "5.4x" },
                ].map((row) => (
                  <tr key={row.c} className="border-b border-border/50 last:border-0">
                    <td className="py-3 font-medium text-foreground">{row.c}</td>
                    <td className="py-3 text-muted">{formatCurrency(row.s)}</td>
                    <td className="py-3 text-muted">{row.l}</td>
                    <td className="py-3 text-muted">{formatCurrency(row.cpl)}</td>
                    <td className="py-3 text-right font-semibold text-success">{row.r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
