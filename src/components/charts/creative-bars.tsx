"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthCount } from "@/lib/creatives";

export interface CreativeBarLabels {
  creatives: string;
  images: string;
  videos: string;
  documents: string;
  limit: string;
}

function Tip({ active, payload, labels }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MonthCount & { label: string };
  const L = labels as CreativeBarLabels;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-float">
      <p className="font-medium text-foreground">{d.label}</p>
      <p className="mt-0.5 text-muted">
        {L.creatives} <span className="font-semibold tabular-nums text-foreground">{d.total.toLocaleString()}</span>
      </p>
      {d.total > 0 && (
        <p className="mt-0.5 text-caption text-muted tabular-nums">
          {d.images} {L.images} · {d.videos} {L.videos}
          {d.documents ? ` · ${d.documents} ${L.documents}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * "Creatives over time": one column per month, the monthly allowance as a red
 * dashed line, and months over the allowance in red.
 */
export function CreativeBars({ data, limit, labels }: { data: (MonthCount & { label: string })[]; limit: number | null; labels: CreativeBarLabels }) {
  const top = Math.max(limit ?? 0, ...data.map((d) => d.total));
  return (
    <div className="h-[240px] sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgb(var(--line))" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={4}
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "rgb(var(--muted))" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, Math.max(4, Math.ceil(top * 1.1))]}
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "rgb(var(--muted))" }}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <Tooltip cursor={{ fill: "rgb(var(--surface-2) / 0.6)" }} content={<Tip labels={labels} />} />
          <Bar dataKey="total" radius={[4, 4, 1, 1]} maxBarSize={44} minPointSize={2} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={limit && d.total > limit ? "rgb(var(--danger))" : d.total > 0 ? "rgb(var(--brand))" : "rgb(var(--line))"} />
            ))}
          </Bar>
          {limit ? (
            <ReferenceLine
              y={limit}
              stroke="rgb(var(--danger))"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{ value: `${labels.limit} ${limit.toLocaleString()}`, position: "insideTopRight", fill: "rgb(var(--danger))", fontSize: 10 }}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
