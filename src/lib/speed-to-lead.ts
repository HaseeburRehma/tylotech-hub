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

/** "0:47" counting down, or "+0:14 overdue" counting up once past zero. */
export function formatCountdown(remaining: number): string {
  const over = remaining < 0;
  const total = Math.abs(remaining);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const body = `${m}:${String(s).padStart(2, "0")}`;
  return over ? `+${body}` : body;
}

/**
 * Should a live INSERT raise the full-screen card? Only genuinely new, unclaimed,
 * still-actionable leads — not test leads, not ones that arrived long ago.
 */
export function shouldAlert(
  lead: { status: string; claimed_at?: string | null; is_test?: boolean; created_at: string },
  serverNowMs: number,
): boolean {
  if (lead.is_test) return false;
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
