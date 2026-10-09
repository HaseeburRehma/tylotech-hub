"use client";

import { motion } from "framer-motion";
import { ChevronDown, Download, TrendingDown, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import type { ProviderSeriesPoint } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export interface SourceStatus {
  connected: boolean;
  lastSyncedAt: string | null;
}

export interface PageRow {
  client_id: string;
  company: string | null;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

type Locale = "de" | "en";
type Unit = "currency" | "number" | "ratio" | "position";
type GroupId = "ads" | "meta_ads" | "google_ads" | "search_console" | "ga4";
type Pt = { date: string; spend: number; leads: number; roas: number; position: number | null };

interface MetricDef {
  id: string;
  label: string;
  unit: Unit;
  /** Window total/average from the days in range (null = not computable). */
  value: (pts: Pt[]) => number | null;
  /** One day's value for the sparkline and the chart. */
  daily: (p: Pt) => number | null;
  lowerIsBetter?: boolean;
}

const RANGES: { id: string; label: string; days: number | "ytd" }[] = [
  { id: "7D", label: "perf.range7", days: 7 },
  { id: "30D", label: "perf.range30", days: 30 },
  { id: "90D", label: "perf.range90", days: 90 },
  { id: "YTD", label: "perf.rangeYtd", days: "ytd" },
];

const sum = (pts: Pt[], f: (p: Pt) => number) => pts.reduce((a, p) => a + f(p), 0);

// The shared {spend, leads, roas} columns mean different things per source:
// Search Console stores clicks in `leads` and impressions in `roas`, GA4 daily
// users in `leads` and sessions in `roas`. Each source gets its own metrics.
const AD_METRICS = (leadsLabel: string): MetricDef[] => [
  { id: "spend", label: "perf.adSpend", unit: "currency", value: (p) => sum(p, (x) => x.spend), daily: (p) => p.spend },
  { id: "leads", label: leadsLabel, unit: "number", value: (p) => sum(p, (x) => x.leads), daily: (p) => p.leads },
  {
    id: "roas",
    label: "perf.metricRoas",
    unit: "ratio",
    // ROAS over a range = total purchase value / total spend, not a mean of days.
    // No purchase value tracked (ROAS 0 throughout) → "—", not a fake 0x.
    value: (p) => {
      const spend = sum(p, (x) => x.spend);
      const value = sum(p, (x) => x.roas * x.spend);
      return spend && value ? value / spend : null;
    },
    daily: (p) => (p.roas ? p.roas : null),
  },
];

const METRICS: Record<GroupId, MetricDef[]> = {
  ads: AD_METRICS("perf.metricLeads"),
  meta_ads: AD_METRICS("perf.metricLeads"),
  google_ads: AD_METRICS("perf.metricConversions"),
  search_console: [
    { id: "clicks", label: "perf.metricClicks", unit: "number", value: (p) => sum(p, (x) => x.leads), daily: (p) => p.leads },
    { id: "impressions", label: "perf.metricImpressions", unit: "number", value: (p) => sum(p, (x) => x.roas), daily: (p) => p.roas },
    {
      id: "position",
      label: "perf.metricPosition",
      unit: "position",
      lowerIsBetter: true,
      // Weighted by impressions, like Search Console itself.
      value: (p) => {
        const w = p.filter((x) => x.position != null && x.roas > 0);
        const imp = sum(w, (x) => x.roas);
        return imp ? sum(w, (x) => (x.position as number) * x.roas) / imp : null;
      },
      daily: (p) => p.position,
    },
  ],
  ga4: [
    { id: "sessions", label: "perf.metricSessions", unit: "number", value: (p) => sum(p, (x) => x.roas), daily: (p) => p.roas },
    // Daily users can't be summed into unique users — show the daily average.
    { id: "users", label: "perf.metricDailyUsers", unit: "number", value: (p) => (p.length ? sum(p, (x) => x.leads) / p.length : null), daily: (p) => p.leads },
    {
      id: "spu",
      label: "perf.metricSessionsPerUser",
      unit: "ratio",
      value: (p) => {
        const users = sum(p, (x) => x.leads);
        return users ? sum(p, (x) => x.roas) / users : null;
      },
      daily: (p) => (p.leads ? p.roas / p.leads : null),
    },
  ],
};

const GROUP_NAME: Record<GroupId, string> = {
  ads: "Meta + Google Ads",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  search_console: "Search Console",
  ga4: "GA4",
};

const AD_PROVIDERS = new Set(["meta_ads", "google_ads"]);

/** Meta + Google Ads per day: counts summed, ROAS weighted by spend. */
function combineAds(points: ProviderSeriesPoint[]): Pt[] {
  const by = new Map<string, Pt & { value: number }>();
  for (const p of points) {
    if (!AD_PROVIDERS.has(p.provider)) continue;
    const c = by.get(p.date) ?? { date: p.date, spend: 0, leads: 0, roas: 0, position: null, value: 0 };
    c.spend += p.spend;
    c.leads += p.leads;
    c.value += p.roas * p.spend;
    by.set(p.date, c);
  }
  return Array.from(by.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ value, ...c }) => ({ ...c, roas: c.spend ? value / c.spend : 0 }));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
function daysAgo(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDay(d);
}
function rangeDayCount(days: number | "ytd", anchor: string) {
  if (days !== "ytd") return days;
  const a = new Date(`${anchor}T00:00:00Z`);
  return Math.floor((a.getTime() - Date.UTC(a.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}

function makeFormat(locale: Locale) {
  const tag = locale === "en" ? "en-GB" : "de-DE";
  const nf = (max: number, min = 0) => new Intl.NumberFormat(tag, { maximumFractionDigits: max, minimumFractionDigits: min });
  const eur = (v: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR", maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }).format(v);
  return {
    value: (v: number | null, unit: Unit) =>
      v == null ? "—" : unit === "currency" ? eur(v) : unit === "ratio" ? `${nf(2).format(v)}x` : unit === "position" ? nf(1, 1).format(v) : nf(0).format(v),
    compact: (v: number) => new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }).format(v),
    pct: (v: number, digits = 1) => `${new Intl.NumberFormat(tag, { maximumFractionDigits: digits, minimumFractionDigits: digits, signDisplay: "exceptZero" }).format(v)} %`,
    int: (v: number) => nf(0).format(v),
    one: (v: number) => nf(1, 1).format(v),
    two: (v: number) => nf(2, 2).format(v),
    dayMonth: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(tag, { day: "numeric", month: "numeric", timeZone: "UTC" }),
    stamp: (iso: string) => ({
      date: new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "numeric", timeZone: "Europe/Berlin" }),
      time: new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }),
    }),
  };
}

/** Fade + rise on first paint, staggered by `i` (one orchestrated page load). */
function Reveal({ i, children, className }: { i: number; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted", className)}>{children}</span>;
}

function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-active={active ? "true" : undefined}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-all duration-200",
        active
          ? "border-brand/50 bg-brand/10 text-foreground shadow-[inset_0_0_0_1px_rgb(var(--brand)/0.15)]"
          : "border-border bg-surface text-muted hover:border-brand/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-border bg-surface-2/60 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
            value === o.id ? "bg-surface text-foreground shadow-card ring-1 ring-border" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-10 w-20 sm:w-28" />;
  const W = 112;
  const H = 40;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-20 shrink-0 overflow-visible sm:w-28" aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.22} />
          <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="rgb(var(--brand))" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.4} fill="rgb(var(--brand))" />
    </svg>
  );
}

function DeltaPill({ delta, lowerIsBetter, fmt }: { delta: number | null; lowerIsBetter?: boolean; fmt: ReturnType<typeof makeFormat> }) {
  if (delta == null) return null;
  const good = lowerIsBetter ? delta <= 0 : delta >= 0;
  const Icon = delta >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        good ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
      )}
    >
      <Icon className="h-3 w-3" />
      {fmt.pct(delta)}
    </span>
  );
}

export function PerformanceView({
  series,
  pages,
  clients = [],
  selected = null,
  isStaff = false,
  sourceStatus = {},
  siteHost = null,
  providers = [],
}: {
  series: ProviderSeriesPoint[];
  pages: PageRow[];
  clients?: { id: string; company: string; slug: string | null }[];
  selected?: string | null;
  isStaff?: boolean;
  sourceStatus?: Record<string, SourceStatus>;
  siteHost?: string | null;
  providers?: { id: string; name: string }[];
}) {
  const { t, locale } = useI18n();
  const fmt = useMemo(() => makeFormat(locale), [locale]);
  const router = useRouter();
  const [range, setRange] = useState("30D");
  const [source, setSource] = useState<"all" | GroupId>("all");
  const [metricId, setMetricId] = useState<string | null>(null);
  const [allPages, setAllPages] = useState(false);

  const portfolio = selected === "all";
  const scope = portfolio ? t("perf.allClients") : clients.find((c) => c.id === selected)?.company ?? "";

  // Which providers actually have data, and the per-group daily series.
  const withData = useMemo(() => new Set(series.map((p) => p.provider)), [series]);
  const groupSeries = useMemo(() => {
    const toPt = (p: ProviderSeriesPoint): Pt => ({ date: p.date, spend: p.spend, leads: p.leads, roas: p.roas, position: p.position ?? null });
    const of = (prov: string) => series.filter((p) => p.provider === prov).map(toPt);
    return { ads: combineAds(series), meta_ads: of("meta_ads"), google_ads: of("google_ads"), search_console: of("search_console"), ga4: of("ga4") } as Record<GroupId, Pt[]>;
  }, [series]);

  const groups: GroupId[] = useMemo(() => {
    if (source !== "all") return groupSeries[source].length ? [source] : [];
    const out: GroupId[] = [];
    if (groupSeries.ads.length) out.push(withData.has("meta_ads") && withData.has("google_ads") ? "ads" : withData.has("meta_ads") ? "meta_ads" : "google_ads");
    if (groupSeries.search_console.length) out.push("search_console");
    if (groupSeries.ga4.length) out.push("ga4");
    return out;
  }, [source, groupSeries, withData]);

  // Window: complete days ending at the newest data (tolerating a few days of
  // reporting lag — Search Console runs ~2–3 days behind) or yesterday.
  const rangeDef = RANGES.find((r) => r.id === range) ?? RANGES[1]!;
  const yesterday = daysAgo(isoDay(new Date()), 1);
  const windowFor = (pts: Pt[]) => {
    const last = pts.length ? pts[pts.length - 1]!.date : null;
    const anchor = last && last >= daysAgo(yesterday, 4) ? last : yesterday;
    const n = rangeDayCount(rangeDef.days, anchor);
    const curStart = daysAgo(anchor, n - 1);
    const prevEnd = daysAgo(curStart, 1);
    const prevStart = daysAgo(prevEnd, n - 1);
    return {
      n,
      cur: pts.filter((p) => p.date >= curStart && p.date <= anchor),
      prev: pts.filter((p) => p.date >= prevStart && p.date <= prevEnd),
    };
  };

  const cardsFor = (g: GroupId) => {
    const { n, cur, prev } = windowFor(groupSeries[g]);
    // Only compare against a mostly-populated prior window.
    const comparable = new Set(prev.map((p) => p.date)).size >= Math.ceil(n * 0.8);
    return METRICS[g].map((m) => {
      const v = m.value(cur);
      const pv = comparable ? m.value(prev) : null;
      const delta = v != null && pv ? ((v - pv) / pv) * 100 : null;
      const spark = cur.map(m.daily).filter((x): x is number => x != null);
      return { m, v, delta, spark };
    });
  };

  // Chart: the selected source, or the first group with data.
  const chartGroup = groups[0] ?? null;
  const chartMetrics = chartGroup ? METRICS[chartGroup] : [];
  const chartMetric = chartMetrics.find((m) => m.id === metricId) ?? chartMetrics[0] ?? null;
  const chartWindow = chartGroup ? windowFor(groupSeries[chartGroup]) : null;
  const chartData = useMemo(
    () =>
      chartWindow && chartMetric
        ? chartWindow.cur.map((p) => ({ date: p.date, value: chartMetric.daily(p) })).filter((d): d is { date: string; value: number } => d.value != null)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartGroup, chartMetric, range, series],
  );

  // Status line: who synced when, who has nothing yet.
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const listJoin = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${t("perf.and")} ${names[names.length - 1]}`);
  const live = providers.filter((p) => withData.has(p.id));
  const missing = providers.filter((p) => !withData.has(p.id));
  const stale = live.filter((p) => sourceStatus[p.id] && !sourceStatus[p.id]!.connected);
  const lastSync = live.map((p) => sourceStatus[p.id]?.lastSyncedAt).filter(Boolean).sort().pop() as string | undefined;
  const fresh = !!lastSync && Date.now() - Date.parse(lastSync) < 48 * 3_600_000 && !stale.length;

  // Clients row: "Alle Kunden" + a few clients (the selected one always shown) + "+N weitere".
  const VISIBLE = 5;
  const visibleClients = useMemo(() => {
    const first = clients.slice(0, VISIBLE);
    const sel = clients.find((c) => c.id === selected);
    return sel && !first.includes(sel) ? [...first.slice(0, VISIBLE - 1), sel] : first;
  }, [clients, selected]);
  const moreClients = clients.filter((c) => !visibleClients.includes(c));
  const goClient = (ref: string) => router.push(`/performance?client=${encodeURIComponent(ref)}`);

  const showPages = (source === "all" || source === "search_console") && pages.length > 0;
  const shownPages = allPages ? pages : pages.slice(0, 5);
  const maxClicks = Math.max(1, ...pages.map((p) => p.clicks));
  const pathOf = (url: string) => {
    try {
      const u = new URL(url);
      return { host: u.host.replace(/^www\./, ""), path: `${u.pathname}${u.search}` || "/" };
    } catch {
      return { host: "", path: url };
    }
  };

  const exportHref = portfolio || !selected ? null : `/api/reports/performance?client=${selected}`;
  const sourceOptions: { id: "all" | GroupId; name: string }[] = [
    { id: "all", name: t("perf.allSources") },
    ...providers.map((p) => ({ id: p.id as GroupId, name: p.name })),
  ];

  // On narrow screens the chip rows scroll sideways — bring the selected client into view.
  const clientRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = clientRow.current;
    const chip = row?.querySelector<HTMLElement>('[data-active="true"]');
    if (row && chip) row.scrollLeft = Math.max(0, chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2);
  }, [selected]);

  let reveal = 0;
  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal i={reveal++} className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-foreground">{t("perf.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("perf.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("perf.rangeLabel")}
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ id: r.id, label: t(r.label).toUpperCase() }))}
          />
          <button
            type="button"
            disabled={!exportHref}
            title={exportHref ? undefined : t("perf.exportPickClient")}
            onClick={() => exportHref && window.open(exportHref, "_blank")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {t("perf.exportPdf")}
          </button>
        </div>
      </Reveal>

      {/* Filters */}
      <Reveal i={reveal++}>
        <Card className="divide-y divide-border/70 p-0">
          {isStaff && clients.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-3">
              <Eyebrow className="w-14 shrink-0">{t("perf.client")}</Eyebrow>
              <div ref={clientRow} className="relative flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                <Chip active={portfolio} onClick={() => goClient("all")}>
                  {t("perf.allClients")}
                </Chip>
                {visibleClients.map((c) => (
                  <Chip key={c.id} active={c.id === selected} onClick={() => goClient(c.slug ?? c.id)}>
                    {c.company}
                  </Chip>
                ))}
                {moreClients.length > 0 && (
                  <Menu
                    width={240}
                    trigger={({ toggle, open }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={open}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted transition-colors hover:text-foreground"
                      >
                        {t("perf.moreClients", { n: moreClients.length })} <ChevronDown className="h-3 w-3" />
                      </button>
                    )}
                  >
                    {(close) =>
                      moreClients.map((c) => (
                        <MenuItem
                          key={c.id}
                          onSelect={() => {
                            close();
                            goClient(c.slug ?? c.id);
                          }}
                        >
                          {c.company}
                        </MenuItem>
                      ))
                    }
                  </Menu>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 px-4 py-3">
            <Eyebrow className="w-14 shrink-0">{t("perf.source")}</Eyebrow>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
              {sourceOptions.map((s) => (
                <Chip
                  key={s.id}
                  active={source === s.id}
                  onClick={() => {
                    setSource(s.id);
                    setMetricId(null);
                  }}
                >
                  {s.name}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Sync status */}
      {(live.length > 0 || missing.length > 0) && series.length > 0 && (
        <Reveal i={reveal++}>
          <p className="flex items-start gap-2 text-xs text-muted">
            <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", fresh ? "bg-success shadow-[0_0_0_3px_rgb(var(--success)/0.15)]" : "bg-warning")} />
            <span>
              {lastSync &&
                t("perf.syncedAt", {
                  sources: listJoin(live.map((p) => p.name)),
                  date: fmt.stamp(lastSync).date,
                  time: fmt.stamp(lastSync).time,
                })}
              {stale.length > 0 && ` ${t("perf.disconnectedNote", { sources: listJoin(stale.map((p) => p.name)) })}`}
              {missing.length > 0 &&
                ` ${t(missing.length === 1 ? "perf.noDataYetNoteOne" : "perf.noDataYetNote", { sources: listJoin(missing.map((p) => providerName(p.id))) })}`}
            </span>
          </p>
        </Reveal>
      )}

      {series.length === 0 ? (
        <Reveal i={reveal++}>
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">{t("perf.noData")}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{t("perf.noDataBody")}</p>
          </Card>
        </Reveal>
      ) : groups.length === 0 ? (
        <Reveal i={reveal++}>
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">{t("perf.noSourceData", { source: sourceOptions.find((s) => s.id === source)?.name ?? source })}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">{t("perf.noSourceDataBody")}</p>
          </Card>
        </Reveal>
      ) : (
        <>
          {/* KPI cards — one row of three per source with data */}
          {groups.map((g) => (
            <Reveal key={g} i={reveal++} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cardsFor(g).map(({ m, v, delta, spark }) => (
                <Card key={m.id} className="group relative overflow-hidden p-4 transition-shadow hover:shadow-float">
                  <div className="flex items-start justify-between gap-3">
                    <Eyebrow className="truncate">{t(m.label)}</Eyebrow>
                    <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">
                      {GROUP_NAME[g]} · {t(rangeDef.label)}.
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{fmt.value(v, m.unit)}</p>
                      <div className="mt-2 h-5">
                        <DeltaPill delta={delta} lowerIsBetter={m.lowerIsBetter} fmt={fmt} />
                      </div>
                    </div>
                    <Sparkline values={spark} />
                  </div>
                </Card>
              ))}
            </Reveal>
          ))}

          {/* Trend */}
          {chartGroup && chartMetric && (
            <Reveal i={reveal++}>
              <Card className="relative overflow-hidden p-0">
                {/* soft gold glow behind the curve */}
                <div aria-hidden className="pointer-events-none absolute -top-24 left-1/3 h-56 w-2/3 rounded-full bg-brand/10 blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
                  <div>
                    <h2 className="font-display text-base font-semibold text-foreground">{t("perf.trend")}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {t("perf.trendSub", { n: chartWindow?.n ?? 0, scope: scope || GROUP_NAME[chartGroup] })} · {GROUP_NAME[chartGroup]}
                    </p>
                  </div>
                  {chartMetrics.length > 1 && (
                    <Segmented label={t("perf.trend")} value={chartMetric.id} onChange={setMetricId} options={chartMetrics.map((m) => ({ id: m.id, label: t(m.label) }))} />
                  )}
                </div>
                {chartData.length > 1 ? (
                  <div className="relative h-[280px] px-2 pb-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="perf-trend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.32} />
                            <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="rgb(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={fmt.dayMonth}
                          tick={{ fontSize: 10, fill: "rgb(var(--muted))", fontFamily: "var(--font-mono)" }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={28}
                        />
                        <YAxis
                          width={44}
                          reversed={chartMetric.unit === "position"}
                          tickFormatter={(v: number) => (chartMetric.unit === "position" ? fmt.one(v) : fmt.compact(v))}
                          tick={{ fontSize: 10, fill: "rgb(var(--muted))", fontFamily: "var(--font-mono)" }}
                          axisLine={false}
                          tickLine={false}
                          domain={chartMetric.unit === "position" ? ["dataMin - 1", "dataMax + 1"] : [0, "auto"]}
                        />
                        <Tooltip
                          cursor={{ stroke: "rgb(var(--brand))", strokeOpacity: 0.35 }}
                          content={({ active, payload, label }) =>
                            active && payload?.length ? (
                              <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-float">
                                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{fmt.dayMonth(String(label))}</p>
                                <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                                  {t(chartMetric.label)}: {fmt.value(Number(payload[0]!.value), chartMetric.unit)}
                                </p>
                              </div>
                            ) : null
                          }
                        />
                        <Area type="monotone" dataKey="value" stroke="rgb(var(--brand))" strokeWidth={2.2} fill="url(#perf-trend)" animationDuration={700} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[220px] items-center justify-center text-sm text-muted">{t("perf.noSeries")}</div>
                )}
              </Card>
            </Reveal>
          )}

          {/* Top pages from Search Console */}
          {showPages && (
            <Reveal i={reveal++}>
              <Card className="p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
                  <div>
                    <h2 className="font-display text-base font-semibold text-foreground">{t("perf.topPages")}</h2>
                    <p className="mt-0.5 text-xs text-muted">{t("perf.topPagesSub", { scope: portfolio ? t("perf.allClients") : siteHost ?? scope })}</p>
                  </div>
                  {pages.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setAllPages((v) => !v)}
                      aria-expanded={allPages}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40"
                    >
                      {allPages ? t("perf.fewerPages") : t("perf.allPages", { n: pages.length })}
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-y border-border/70 bg-surface-2/40">
                        <th className="px-5 py-2.5 text-left"><Eyebrow>{t("perf.col.page")}</Eyebrow></th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right"><Eyebrow>{t("perf.col.clicks")}</Eyebrow></th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right"><Eyebrow>{t("perf.col.impressions")}</Eyebrow></th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right"><Eyebrow>{t("perf.col.ctr")}</Eyebrow></th>
                        <th className="whitespace-nowrap px-5 py-2.5 text-right"><Eyebrow>{t("perf.col.position")}</Eyebrow></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownPages.map((p, i) => {
                        const { host, path } = pathOf(p.page);
                        return (
                          <motion.tr
                            key={`${p.client_id}-${p.page}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: Math.min(i, 10) * 0.03 }}
                            className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                          >
                            <td className="max-w-[340px] px-5 py-3">
                              <a href={p.page} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-[13px] text-foreground hover:text-brand" title={p.page}>
                                {portfolio && <span className="text-muted">{host}</span>}
                                {path === "/" ? `/ (${t("perf.homepage")})` : path}
                              </a>
                              {portfolio && p.company && <span className="text-[11px] text-muted">{p.company}</span>}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-3">
                                <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-surface-2 sm:block">
                                  <motion.div
                                    className="h-full rounded-full bg-brand"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(p.clicks / maxClicks) * 100}%` }}
                                    transition={{ duration: 0.6, delay: 0.1 + Math.min(i, 10) * 0.03, ease: [0.22, 1, 0.36, 1] }}
                                  />
                                </div>
                                <span className="w-10 text-right font-semibold tabular-nums text-foreground">{fmt.int(p.clicks)}</span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted">{fmt.int(p.impressions)}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted">{fmt.two(p.ctr * 100)} %</td>
                            <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-muted">{fmt.one(p.position)}</td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </Reveal>
          )}
        </>
      )}
    </div>
  );
}
