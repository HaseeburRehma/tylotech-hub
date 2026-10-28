/**
 * Date ranges as Meta Ads Manager offers them (presets + custom), always in
 * Berlin time and as plain calendar days ("2026-10-27"). "Last N days" ends
 * yesterday, like Meta, so numbers match Ads Manager.
 */

export const APP_TZ = "Europe/Berlin";

export type RangePreset =
  | "maximum"
  | "today"
  | "yesterday"
  | "today_yesterday"
  | "last_7d"
  | "last_14d"
  | "last_28d"
  | "last_30d"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

export const RANGE_PRESETS: Exclude<RangePreset, "custom">[] = [
  "maximum",
  "today",
  "yesterday",
  "today_yesterday",
  "last_7d",
  "last_14d",
  "last_28d",
  "last_30d",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
];

/** Inclusive calendar-day range; null bounds = open ("Maximum"). */
export interface DateRange {
  preset: RangePreset;
  since: string | null;
  until: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Today's date in Berlin. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Day arithmetic on "YYYY-MM-DD" (calendar days, no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Monday … 6 = Sunday (German week). */
export function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The days a preset covers, seen from `today` (Berlin). */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: string = berlinToday()): DateRange {
  const yesterday = addDays(today, -1);
  const last = (n: number): DateRange => ({ preset, since: addDays(yesterday, -(n - 1)), until: yesterday });
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "maximum":
      return { preset, since: null, until: null };
    case "today":
      return { preset, since: today, until: today };
    case "yesterday":
      return { preset, since: yesterday, until: yesterday };
    case "today_yesterday":
      return { preset, since: yesterday, until: today };
    case "last_7d":
      return last(7);
    case "last_14d":
      return last(14);
    case "last_28d":
      return last(28);
    case "last_30d":
      return last(30);
    case "this_week":
      return { preset, since: addDays(today, -weekday(today)), until: today };
    case "last_week": {
      const monday = addDays(today, -weekday(today) - 7);
      return { preset, since: monday, until: addDays(monday, 6) };
    }
    case "this_month":
      return { preset, since: ymd(y, m, 1), until: today };
    case "last_month": {
      const firstThis = ymd(y, m, 1);
      const lastPrev = addDays(firstThis, -1);
      return { preset, since: `${lastPrev.slice(0, 7)}-01`, until: lastPrev };
    }
  }
}

/** Offset (ms) of Berlin from UTC at a given instant. */
function berlinOffset(ts: number): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ts));
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - ts;
}

/** Midnight (start) of a Berlin calendar day, as a timestamp. */
export function berlinDayStart(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let ts = guess - berlinOffset(guess);
  ts = guess - berlinOffset(ts);
  return ts;
}

/** Whether an instant falls inside the range (Berlin days, inclusive). */
export function inRange(iso: string, r: DateRange): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  if (r.since && t < berlinDayStart(r.since)) return false;
  if (r.until && t >= berlinDayStart(addDays(r.until, 1))) return false;
  return true;
}

/** Same length, directly before (for "vs. previous period"). Null for open ranges. */
export function previousRange(r: DateRange): DateRange | null {
  if (!r.since || !r.until) return null;
  const days = daysBetween(r.since, r.until) + 1;
  return { preset: "custom", since: addDays(r.since, -days), until: addDays(r.since, -1) };
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "28 Sep 2026" / "28. Sept. 2026". */
export function formatDay(day: string, locale: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Weeks of a month for a calendar grid (Monday first). Days outside the
 * month are null so the grid keeps its shape.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = ymd(year, month, 1);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(weekday(first)).fill(null);
  for (let d = 1; d <= days; d++) cells.push(ymd(year, month, d));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Parse a range from URL params (?range=last_30d or ?from=…&to=…). */
export function rangeFromParams(sp: URLSearchParams, fallback: Exclude<RangePreset, "custom"> = "maximum", today?: string): DateRange {
  const p = sp.get("range");
  if (p && (RANGE_PRESETS as string[]).includes(p)) return presetRange(p as Exclude<RangePreset, "custom">, today);
  const since = sp.get("from");
  const until = sp.get("to");
  const ok = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  if (ok(since) && ok(until) && since! <= until!) return { preset: "custom", since, until };
  return presetRange(fallback, today);
}
