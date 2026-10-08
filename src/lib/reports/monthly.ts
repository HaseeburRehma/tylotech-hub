import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Monthly report data for one client and one calendar month, computed from the
 * daily metric_points rows (real provider data). Month-over-month changes are
 * only given when both months have data for that source — never fabricated.
 */

export interface MonthlyMetric {
  label: string;
  value: number;
  unit: "currency" | "number" | "ratio" | "percent";
  /** % change vs previous month; null = no like-for-like comparison. */
  change: number | null;
  /** Lower is better (e.g. cost per lead). */
  lowerIsBetter?: boolean;
}

export interface MonthlySection {
  key: "ads" | "meta_ads" | "google_ads" | "search_console" | "ga4";
  title: string;
  metrics: MonthlyMetric[];
}

export interface MonthlyReportData {
  clientId: string;
  company: string;
  brandColor: string;
  period: string; // YYYY-MM
  periodLabel: string; // "September 2026"
  rangeLabel: string; // "1.–30. September 2026"
  sections: MonthlySection[];
  updates: { title: string; date: string }[];
  hasData: boolean;
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(p: unknown): p is string {
  return typeof p === "string" && PERIOD_RE.test(p);
}

/** The month before `now`, as YYYY-MM (what the monthly cron reports on). */
export function previousPeriod(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(period: string) {
  const [, y, m] = period.match(PERIOD_RE)!;
  const year = Number(y);
  const month = Number(m) - 1;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const prevStart = new Date(Date.UTC(year, month - 1, 1));
  const prevEnd = new Date(Date.UTC(year, month, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), prevStart: iso(prevStart), prevEnd: iso(prevEnd), days: end.getUTCDate(), startDate: start };
}

/** ISO instant of 00:00 Berlin time on `date` (YYYY-MM-DD), DST-aware. */
export function berlinMidnightUtc(date: string): string {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  // Berlin's offset on that day, e.g. "GMT+2" → 2 hours.
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" })
    .formatToParts(utcMidnight)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const hours = Number(name.replace("GMT", "") || "0");
  return new Date(utcMidnight.getTime() - hours * 3_600_000).toISOString();
}

const nextDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

type Point = { date: string; provider: string; spend: number; leads: number; roas: number };

function pct(cur: number, prev: number): number | null {
  if (!(prev > 0) || !Number.isFinite(cur)) return null;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

/** Both months need data for a like-for-like change (≥ 10 days previous, ≥ 1 current). */
function comparable(cur: Point[], prev: Point[]) {
  return new Set(prev.map((p) => p.date)).size >= 10 && cur.length > 0;
}

function adMetrics(cur: Point[], prev: Point[]): MonthlyMetric[] {
  const agg = (rows: Point[]) => {
    const spend = rows.reduce((a, p) => a + p.spend, 0);
    const leads = rows.reduce((a, p) => a + p.leads, 0);
    const value = rows.reduce((a, p) => a + p.roas * p.spend, 0);
    return { spend, leads, cpl: leads > 0 ? spend / leads : 0, roas: spend > 0 ? value / spend : 0 };
  };
  const c = agg(cur);
  const p = agg(prev);
  const ok = comparable(cur, prev);
  const metrics: MonthlyMetric[] = [
    { label: "Werbebudget", value: Number(c.spend.toFixed(2)), unit: "currency", change: ok ? pct(c.spend, p.spend) : null },
    { label: "Leads", value: c.leads, unit: "number", change: ok ? pct(c.leads, p.leads) : null },
    { label: "Kosten pro Lead", value: Number(c.cpl.toFixed(2)), unit: "currency", change: ok && c.cpl && p.cpl ? pct(c.cpl, p.cpl) : null, lowerIsBetter: true },
  ];
  if (c.roas > 0) metrics.push({ label: "ROAS", value: Number(c.roas.toFixed(2)), unit: "ratio", change: ok && p.roas ? pct(c.roas, p.roas) : null });
  return metrics;
}

const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export async function buildMonthlyReport(admin: SupabaseClient, clientId: string, period: string): Promise<MonthlyReportData | null> {
  if (!isPeriod(period)) return null;
  const { data: client } = await admin.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!client) return null;
  const r = monthRange(period);

  const [{ data: rows }, { data: ups }] = await Promise.all([
    admin
      .from("metric_points")
      .select("date,provider,spend,leads,roas")
      .eq("client_id", clientId)
      .gte("date", r.prevStart)
      .lte("date", r.end),
    admin
      .from("updates")
      .select("title,created_at")
      .eq("client_id", clientId)
      // Month boundaries in Berlin time — an update posted at 00:30 on the 1st
      // belongs to the new month, not the previous one.
      .gte("created_at", berlinMidnightUtc(r.start))
      .lt("created_at", berlinMidnightUtc(nextDay(r.end)))
      .order("created_at", { ascending: true }),
  ]);

  const points: Point[] = (rows ?? []).map((p: any) => ({
    date: p.date,
    provider: p.provider,
    spend: Number(p.spend),
    leads: Number(p.leads),
    roas: Number(p.roas),
  }));
  const inCur = (p: Point) => p.date >= r.start && p.date <= r.end;
  const inPrev = (p: Point) => p.date >= r.prevStart && p.date <= r.prevEnd;
  const by = (provider: string, f: (p: Point) => boolean) => points.filter((p) => p.provider === provider && f(p));

  const sections: MonthlySection[] = [];
  const adCur = points.filter((p) => (p.provider === "meta_ads" || p.provider === "google_ads") && inCur(p));
  const adPrev = points.filter((p) => (p.provider === "meta_ads" || p.provider === "google_ads") && inPrev(p));
  const adProviders = ["meta_ads", "google_ads"].filter((pr) => by(pr, inCur).length);
  if (adProviders.length > 1) sections.push({ key: "ads", title: "Bezahlte Werbung gesamt", metrics: adMetrics(adCur, adPrev) });
  for (const pr of adProviders) {
    sections.push({
      key: pr as "meta_ads" | "google_ads",
      title: pr === "meta_ads" ? "Meta Ads" : "Google Ads",
      metrics: adMetrics(by(pr, inCur), by(pr, inPrev)),
    });
  }

  // Search Console: `leads` = clicks, `roas` = impressions.
  const scCur = by("search_console", inCur);
  if (scCur.length) {
    const scPrev = by("search_console", inPrev);
    const ok = comparable(scCur, scPrev);
    const sum = (rs: Point[], k: "leads" | "roas") => rs.reduce((a, p) => a + p[k], 0);
    const clicks = sum(scCur, "leads");
    const impr = sum(scCur, "roas");
    const prevImpr = sum(scPrev, "roas");
    const ctr = impr > 0 ? (clicks / impr) * 100 : 0;
    const prevCtr = prevImpr > 0 ? (sum(scPrev, "leads") / prevImpr) * 100 : 0;
    sections.push({
      key: "search_console",
      title: "Google-Suche (Search Console)",
      metrics: [
        { label: "Organische Klicks", value: clicks, unit: "number", change: ok ? pct(clicks, sum(scPrev, "leads")) : null },
        { label: "Impressionen", value: impr, unit: "number", change: ok ? pct(impr, prevImpr) : null },
        ...(impr > 0 ? [{ label: "Klickrate", value: Number(ctr.toFixed(2)), unit: "percent" as const, change: ok ? pct(ctr, prevCtr) : null }] : []),
      ],
    });
  }

  // GA4: `leads` = daily active users, `roas` = sessions. Daily users can't be
  // summed into unique users, so the report shows the daily average.
  const gaCur = by("ga4", inCur);
  if (gaCur.length) {
    const gaPrev = by("ga4", inPrev);
    const ok = comparable(gaCur, gaPrev);
    const sessions = gaCur.reduce((a, p) => a + p.roas, 0);
    const prevSessions = gaPrev.reduce((a, p) => a + p.roas, 0);
    const avgUsers = gaCur.reduce((a, p) => a + p.leads, 0) / gaCur.length;
    const prevAvgUsers = gaPrev.length ? gaPrev.reduce((a, p) => a + p.leads, 0) / gaPrev.length : 0;
    sections.push({
      key: "ga4",
      title: "Website (Google Analytics)",
      metrics: [
        { label: "Sitzungen", value: Math.round(sessions), unit: "number", change: ok ? pct(sessions, prevSessions) : null },
        { label: "Nutzer pro Tag (Ø)", value: Math.round(avgUsers), unit: "number", change: ok ? pct(avgUsers, prevAvgUsers) : null },
      ],
    });
  }

  const monthName = MONTHS_DE[r.startDate.getUTCMonth()];
  const year = r.startDate.getUTCFullYear();
  return {
    clientId,
    company: client.company,
    brandColor: client.primary_color || "#C9A84C",
    period,
    periodLabel: `${monthName} ${year}`,
    rangeLabel: `1.–${r.days}. ${monthName} ${year}`,
    sections,
    updates: (ups ?? []).map((u: any) => ({
      title: u.title,
      date: new Date(u.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: "Europe/Berlin" }),
    })),
    hasData: sections.length > 0,
  };
}
