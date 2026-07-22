"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Kpi } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { MiniSpark } from "@/components/charts/mini-spark";
import { cn } from "@/lib/utils";

function formatValue(k: Kpi) {
  switch (k.unit) {
    case "currency":
      return formatCurrency(k.value);
    case "percent":
      return `${k.value}%`;
    case "ratio":
      return `${k.value.toFixed(1)}x`;
    case "rank":
      return `#${k.value}`;
    default:
      return new Intl.NumberFormat("en").format(k.value);
  }
}

export function KpiCard({
  kpi,
  index = 0,
  spark,
}: {
  kpi: Kpi;
  index?: number;
  spark: Record<string, any>[];
}) {
  // For CPL, a negative delta is good (cheaper leads).
  const goodWhenDown = kpi.metric_name === "cpl";
  const positive = goodWhenDown ? kpi.delta < 0 : kpi.delta >= 0;
  const sparkKey = kpi.metric_name === "leads" ? "leads" : kpi.metric_name === "roas" ? "roas" : "spend";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="card card-hover group relative overflow-hidden p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted">{kpi.label}</p>
          <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {formatValue(kpi)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold",
            positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
          )}
        >
          {positive ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {Math.abs(kpi.delta)}%
        </span>
      </div>

      <div className="mt-3 -mx-1">
        <MiniSpark data={spark} dataKey={sparkKey} />
      </div>

      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted/70">{kpi.source}</span>
        <span className="text-[11px] text-muted/70">{kpi.period}</span>
      </div>
    </motion.div>
  );
}
