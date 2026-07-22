"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

export function MiniSpark({
  data,
  dataKey,
  color = "rgb(var(--brand))",
}: {
  data: Record<string, any>[];
  dataKey: string;
  color?: string;
}) {
  const id = `spark-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          isAnimationActive
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
