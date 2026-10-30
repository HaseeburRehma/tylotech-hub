import type { LeadStatus } from "@/lib/leads-shared";

/**
 * Speed-to-Lead: the 60-second promise. A new lead must be claimed and called
 * fast. These are the pure, time-zone-free helpers the countdown card and its
 * tests share. All times are epoch milliseconds; the server clock is authority
 * (the client measures its own offset so a wrong device clock can't cheat it).
 */

export const SLA_SECONDS = 60;
/** Don't pop a blocking card for a lead already this many seconds old (e.g. a
 *  backfilled/replayed event) — "never start the timer when the app opens". */
export const ALERT_GRACE_SECONDS = 90;

export type CountdownState = "green" | "amber" | "red" | "overdue";

/** Whole seconds left on the 60s clock; negative once overdue. */
export function remainingSeconds(createdAtMs: number, serverNowMs: number): number {
  return Math.ceil((createdAtMs + SLA_SECONDS * 1000 - serverNowMs) / 1000);
}

export function countdownState(remaining: number): CountdownState {
  if (remaining <= 0) return "overdue";
  if (remaining <= 10) return "red";
  if (remaining <= 30) return "amber";
  return "green";
}

/** Unit ladder for elapsed times, largest first (a month is 30 days, a year 365). */
const UNITS: Record<"de" | "en", [string, number][]> = {
  en: [["y", 31_536_000], ["mo", 2_592_000], ["wk", 604_800], ["d", 86_400], ["h", 3_600], ["min", 60], ["s", 1]],
  de: [["J.", 31_536_000], ["Mon.", 2_592_000], ["Wo.", 604_800], ["Tg.", 86_400], ["Std.", 3_600], ["Min.", 60], ["Sek.", 1]],
};

/**
 * A length of time in the largest fitting units: "45 s", "5 min 3 s",
 * "2 h 15 min", "3 d 4 h", "2 wk 1 d", "4 mo 12 d", "1 y 3 mo". At most
 * `parts` neighbouring units, rounded down; a zero second unit is left out.
 */
export function formatDuration(seconds: number, locale: "de" | "en" = "en", parts: 1 | 2 = 2): string {
  const units = UNITS[locale] ?? UNITS.en;
  let left = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const found = units.findIndex(([, size]) => left >= size);
  const i = found < 0 ? units.length - 1 : found; // under a second: "0 s"
  const out: string[] = [];
  for (const [label, size] of units.slice(i, i + parts)) {
    const n = Math.floor(left / size);
    left -= n * size;
    if (n > 0 || out.length === 0) out.push(`${n} ${label}`);
  }
  return out.join(" ");
}

/** "0:47" counting down, then how long it is overdue: "+14 s", "+5 min 3 s", "+2 h 15 min", "+3 d 4 h". */
export function formatCountdown(remaining: number, locale: "de" | "en" = "en"): string {
  if (remaining >= 0) return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return `+${formatDuration(-remaining, locale)}`;
}

/**
 * Should a live INSERT raise the full-screen card? Only new, unclaimed,
 * still-actionable leads — not ones that arrived long ago. Test leads (Meta
 * testing tool, Google "send test data") DO alert, labelled TEST, so a partner
 * can verify the 60-second flow end to end; stats exclude them elsewhere.
 */
export function shouldAlert(
  lead: { status: string; claimed_at?: string | null; is_test?: boolean; created_at: string },
  serverNowMs: number,
): boolean {
  if (lead.status !== "new" || lead.claimed_at) return false;
  const ageS = (serverNowMs - new Date(lead.created_at).getTime()) / 1000;
  return ageS <= ALERT_GRACE_SECONDS;
}

/** One-tap outcomes after the call → the lead's internal status (spec §5.2). */
export interface Outcome {
  key: string;
  status: LeadStatus;
  tone: "positive" | "neutral" | "danger";
}
export const OUTCOMES: Outcome[] = [
  { key: "appointment", status: "appointment_set", tone: "positive" },
  { key: "won", status: "won", tone: "positive" },
  { key: "notReached", status: "not_reached", tone: "neutral" },
  { key: "notInterested", status: "lost", tone: "danger" },
  { key: "spam", status: "invalid", tone: "danger" },
];
