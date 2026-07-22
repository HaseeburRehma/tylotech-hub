"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-border px-3 py-2 text-xs shadow-float">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted">
        MRR <span className="font-semibold text-brand">€{payload[0].value.toLocaleString()}</span>
      </p>
    </div>
  );
}

export function MrrBars({ data }: { data: { month: string; mrr: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          width={44}
          tickFormatter={(v) => `${v / 1000}k`}
        />
        <Tooltip cursor={{ fill: "rgb(var(--surface-2) / 0.5)" }} content={<Tip />} />
        <Bar dataKey="mrr" radius={[6, 6, 0, 0]} maxBarSize={34}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i === data.length - 1 ? "rgb(var(--brand))" : "rgb(var(--brand) / 0.35)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
