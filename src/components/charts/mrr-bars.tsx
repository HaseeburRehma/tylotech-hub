"use client";

import { formatCurrency } from "@/lib/utils";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-border px-3 py-2 text-xs shadow-float">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted">
        MRR <span className="font-semibold text-foreground">{formatCurrency(Number(payload[0].value))}</span>
      </p>
    </div>
  );
}

/**
 * Figma "Umsatzentwicklung": gold gradient columns, empty months as a short
 * track stub, mono month labels and the current value printed above the last bar.
 */
export function MrrBars({ data }: { data: { month: string; mrr: number }[] }) {
  const last = data.length - 1;
  return (
    <div className="h-[220px] sm:h-[280px]">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 24, right: 12, left: 12, bottom: 4 }}>
        <defs>
          <linearGradient id="mrr-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.75} />
            <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={1} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          // Every month on wide charts; on phones recharts drops the ones that would collide.
          interval="preserveStartEnd"
          minTickGap={6}
          tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "rgb(var(--muted))" }}
        />
        <YAxis hide domain={[0, (max: number) => Math.max(max, 1000)]} />
        <Tooltip cursor={{ fill: "rgb(var(--surface-2) / 0.6)" }} content={<Tip />} />
        <Bar dataKey="mrr" radius={[4, 4, 1, 1]} maxBarSize={24} minPointSize={6} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.mrr > 0 ? "url(#mrr-bar)" : "rgb(var(--line))"} />
          ))}
          <LabelList
            dataKey="mrr"
            position="top"
            content={({ x, y, width, value, index }: any) =>
              index === last && Number(value) > 0 ? (
                <text
                  x={Number(x) + Number(width) / 2}
                  y={Number(y) - 8}
                  textAnchor="middle"
                  className="fill-foreground font-display text-xs font-semibold"
                >
                  {formatCurrency(Number(value))}
                </text>
              ) : null
            }
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
