"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

/**
 * Legend swatches use the raw color string (e.g. "rgb(var(--info))") which is valid
 * CSS and renders identically on server and client — no hydration mismatch.
 * The SVG chart cells need a literal color, so var() is resolved there; the chart
 * itself only renders on the client (ResponsiveContainer needs measured dimensions).
 */
function resolveVar(c: string) {
  if (typeof window === "undefined") return c;
  const m = c.match(/var\((--[\w-]+)\)/);
  if (!m) return c;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v ? c.replace(/var\(--[\w-]+\)/, v) : c;
}

export function Donut({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={48}
              outerRadius={68}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={resolveVar(d.color)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-semibold">100%</span>
          <span className="text-[10px] text-muted">channels</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: d.color }}
            />
            <span className="text-muted">{d.name}</span>
            <span className="ml-auto font-semibold text-foreground">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
