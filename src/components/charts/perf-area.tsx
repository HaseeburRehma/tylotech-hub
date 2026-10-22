"use client";

import { formatCurrency } from "@/lib/utils";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SeriesPoint } from "@/types";
import { APP_TZ } from "@/lib/utils";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en", { timeZone: APP_TZ, day: "numeric", month: "short" });
}

function ChartTooltip({ active, payload, label, labels }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-border px-3 py-2 text-xs shadow-float">
      <p className="mb-1 font-medium text-foreground">{fmtDate(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{labels?.[p.dataKey] ?? (p.dataKey.charAt(0).toUpperCase() + p.dataKey.slice(1))}</span>
          <span className="ml-auto font-semibold text-foreground">
            {p.dataKey === "spend" ? formatCurrency(Number(p.value)) : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(p.value))}
          </span>
        </p>
      ))}
    </div>
  );
}

export function PerfArea({
  data,
  keys = ["spend"],
  labels,
}: {
  data: SeriesPoint[];
  keys?: ("spend" | "leads" | "roas")[];
  /** Override the display name per key (defaults to the raw key, e.g. "spend") — use
   * when a source repurposes the shared spend/leads/roas shape for its own metric,
   * e.g. Search Console's "leads" column actually holds daily clicks. */
  labels?: Partial<Record<"spend" | "leads" | "roas", string>>;
}) {
  const colorFor = (k: string) =>
    k === "spend" ? "rgb(var(--brand))" : k === "leads" ? "rgb(var(--positive))" : "rgb(var(--success))";
  // Spend (€ thousands) and leads (tens) share no scale: with more than one series
  // each gets its own hidden axis so both lines stay readable (Figma trend chart).
  const multi = keys.length > 1;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 16, right: multi ? 16 : 8, left: multi ? 16 : -16, bottom: 0 }}>
        <defs>
          {keys.map((k) => (
            <linearGradient key={k} id={`area-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorFor(k)} stopOpacity={0.28} />
              <stop offset="100%" stopColor={colorFor(k)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--line))" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "rgb(var(--muted))" }}
        />
        {multi ? (
          keys.map((k) => <YAxis key={k} yAxisId={k} hide domain={[0, "auto"]} />)
        ) : (
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "rgb(var(--muted))" }} width={48} />
        )}
        <Tooltip content={<ChartTooltip labels={labels} />} />
        {keys.map((k, i) => (
          <Area
            key={k}
            yAxisId={multi ? k : undefined}
            type="monotone"
            dataKey={k}
            stroke={colorFor(k)}
            strokeWidth={2}
            // Only the first series is filled; the others are plain lines.
            fill={i === 0 ? `url(#area-${k})` : "transparent"}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
