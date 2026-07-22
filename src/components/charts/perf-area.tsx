"use client";

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

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en", { day: "numeric", month: "short" });
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-border px-3 py-2 text-xs shadow-float">
      <p className="mb-1 font-medium text-foreground">{fmtDate(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.dataKey}</span>
          <span className="ml-auto font-semibold text-foreground">
            {p.dataKey === "spend" ? `€${p.value}` : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export function PerfArea({
  data,
  keys = ["spend"],
}: {
  data: SeriesPoint[];
  keys?: ("spend" | "leads" | "roas")[];
}) {
  const colorFor = (k: string) =>
    k === "spend" ? "rgb(var(--brand))" : k === "leads" ? "rgb(var(--info))" : "rgb(var(--success))";

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {keys.map((k) => (
            <linearGradient key={k} id={`area-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorFor(k)} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colorFor(k)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tick={{ fontSize: 11 }}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={48} />
        <Tooltip content={<ChartTooltip />} />
        {keys.map((k) => (
          <Area
            key={k}
            type="monotone"
            dataKey={k}
            stroke={colorFor(k)}
            strokeWidth={2.5}
            fill={`url(#area-${k})`}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
