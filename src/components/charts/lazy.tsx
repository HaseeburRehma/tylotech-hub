"use client";

// Charts load after the page: recharts is ~100 kB, and every chart sits below
// the page header, so the page becomes usable first. The placeholders keep the
// chart's exact height so nothing shifts when it arrives.
import dynamic from "next/dynamic";

const Placeholder = ({ height }: { height: number | string }) => (
  <div className="w-full animate-pulse rounded-xl bg-surface-2/70" style={{ height }} aria-hidden />
);

export const PerfArea = dynamic(() => import("./perf-area").then((m) => m.PerfArea), {
  ssr: false,
  loading: () => <Placeholder height={300} />,
});

export const MrrBars = dynamic(() => import("./mrr-bars").then((m) => m.MrrBars), {
  ssr: false,
  loading: () => <Placeholder height="100%" />,
});
