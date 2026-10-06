/**
 * Client health score — an early churn warning for staff, computed only from
 * real activity. Each signal scores 0–100; signals without data are left out
 * (weights rescale) instead of guessing. Fewer than MIN_SIGNALS → no score.
 */

export type HealthSignalKey = "connections" | "trend" | "communication" | "updates" | "delivery";
export type HealthLevel = "healthy" | "watch" | "risk" | "unknown";

export interface HealthSignal {
  key: HealthSignalKey;
  score: number; // 0–100
  weight: number;
  /** i18n key + params explaining the score in plain language. */
  reason: string;
  params?: Record<string, string | number>;
}

export interface ClientHealth {
  score: number | null;
  level: HealthLevel;
  signals: HealthSignal[];
  /** Weakest signal — shown as the one-line "why". */
  topIssue: HealthSignal | null;
}

export interface HealthInput {
  now?: number;
  /** Client start date — new clients get a grace period for contact/updates. */
  clientCreatedAt?: string | null;
  integrations: { status: string; lastSyncedAt: string | null }[];
  /** Ad-platform daily rows (Meta / Google Ads) for the last ~60 days. */
  adPoints: { date: string; leads: number }[];
  /** Group + DM messages in the client's workspace (newest first not required). */
  messages: { createdAt: string; fromStaff: boolean }[];
  updates: { createdAt: string }[];
  projects: { status: string; due: string | null }[];
}

export const WEIGHTS: Record<HealthSignalKey, number> = {
  connections: 25,
  trend: 25,
  communication: 20,
  updates: 15,
  delivery: 15,
};

export const MIN_SIGNALS = 3;
const DAY = 86_400_000;
const GRACE_DAYS = 14;
const STALE_SYNC_MS = 3 * DAY;

const daysSince = (iso: string, now: number) => Math.floor((now - Date.parse(iso)) / DAY);
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function connections(input: HealthInput, now: number): HealthSignal {
  const connected = input.integrations.filter((i) => i.status === "connected" || i.status === "error");
  if (!connected.length) {
    return { key: "connections", score: 0, weight: WEIGHTS.connections, reason: "health.r.noSources" };
  }
  const errors = connected.filter((i) => i.status === "error").length;
  const stale = connected.filter(
    (i) => i.status === "connected" && (!i.lastSyncedAt || now - Date.parse(i.lastSyncedAt) > STALE_SYNC_MS),
  ).length;
  const healthy = connected.length - errors - stale;
  const score = Math.round(((healthy + stale * 0.5) / connected.length) * 100);
  if (errors) return { key: "connections", score, weight: WEIGHTS.connections, reason: "health.r.sourceErrors", params: { n: errors } };
  if (stale) return { key: "connections", score, weight: WEIGHTS.connections, reason: "health.r.sourcesStale", params: { n: stale } };
  return { key: "connections", score, weight: WEIGHTS.connections, reason: "health.r.sourcesOk", params: { n: healthy } };
}

function trend(input: HealthInput, now: number): HealthSignal | null {
  // Two equal windows of complete days ending yesterday (same as the dashboards).
  const end = isoDay(now - DAY);
  const curStart = isoDay(now - 30 * DAY);
  const prevStart = isoDay(now - 60 * DAY);
  const cur = input.adPoints.filter((p) => p.date >= curStart && p.date <= end);
  const prev = input.adPoints.filter((p) => p.date >= prevStart && p.date < curStart);
  const prevDays = new Set(prev.map((p) => p.date)).size;
  const curLeads = cur.reduce((a, p) => a + p.leads, 0);
  const prevLeads = prev.reduce((a, p) => a + p.leads, 0);
  // Like-for-like only: a populated prior window and data in the current one.
  if (prevDays < 10 || !cur.length || prevLeads <= 0) return null;
  const change = ((curLeads - prevLeads) / prevLeads) * 100;
  const score = change >= 10 ? 100 : change >= -10 ? 75 : change >= -30 ? 40 : 10;
  return {
    key: "trend",
    score,
    weight: WEIGHTS.trend,
    reason: change >= 0 ? "health.r.leadsUp" : "health.r.leadsDown",
    params: { pct: Math.round(Math.abs(change)), cur: curLeads, prev: prevLeads },
  };
}

function communication(input: HealthInput, now: number, isNew: boolean): HealthSignal | null {
  if (!input.messages.length) {
    if (isNew) return null;
    return { key: "communication", score: 20, weight: WEIGHTS.communication, reason: "health.r.noMessages" };
  }
  const sorted = [...input.messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const last = sorted[0];
  const age = daysSince(last.createdAt, now);
  // A client message nobody answered is the strongest warning sign.
  if (!last.fromStaff && age >= 2) {
    return { key: "communication", score: age >= 7 ? 0 : 25, weight: WEIGHTS.communication, reason: "health.r.unanswered", params: { days: age } };
  }
  const score = age <= 7 ? 100 : age <= 14 ? 70 : age <= 30 ? 40 : 10;
  return { key: "communication", score, weight: WEIGHTS.communication, reason: "health.r.lastContact", params: { days: age } };
}

function updates(input: HealthInput, now: number, isNew: boolean): HealthSignal | null {
  if (!input.updates.length) {
    if (isNew) return null;
    return { key: "updates", score: 0, weight: WEIGHTS.updates, reason: "health.r.noUpdates" };
  }
  const newest = Math.max(...input.updates.map((u) => Date.parse(u.createdAt)));
  const age = Math.floor((now - newest) / DAY);
  const score = age <= 14 ? 100 : age <= 30 ? 60 : age <= 60 ? 30 : 0;
  return { key: "updates", score, weight: WEIGHTS.updates, reason: "health.r.lastUpdate", params: { days: age } };
}

function delivery(input: HealthInput, now: number): HealthSignal | null {
  const open = input.projects.filter((p) => p.status !== "done");
  if (!open.length) return null;
  const today = isoDay(now);
  const overdue = open.filter((p) => p.due && p.due < today).length;
  const blocked = open.filter((p) => p.status === "blocked").length;
  const score = Math.max(0, 100 - overdue * 35 - blocked * 25);
  if (overdue) return { key: "delivery", score, weight: WEIGHTS.delivery, reason: "health.r.overdue", params: { n: overdue } };
  if (blocked) return { key: "delivery", score, weight: WEIGHTS.delivery, reason: "health.r.blocked", params: { n: blocked } };
  return { key: "delivery", score, weight: WEIGHTS.delivery, reason: "health.r.onTrack", params: { n: open.length } };
}

export function levelFor(score: number | null): HealthLevel {
  if (score == null) return "unknown";
  return score >= 75 ? "healthy" : score >= 50 ? "watch" : "risk";
}

export function computeHealth(input: HealthInput): ClientHealth {
  const now = input.now ?? Date.now();
  const isNew = !!input.clientCreatedAt && now - Date.parse(input.clientCreatedAt) < GRACE_DAYS * DAY;
  const signals = [
    connections(input, now),
    trend(input, now),
    communication(input, now, isNew),
    updates(input, now, isNew),
    delivery(input, now),
  ].filter((s): s is HealthSignal => s !== null);

  if (signals.length < MIN_SIGNALS) {
    return { score: null, level: "unknown", signals, topIssue: null };
  }
  const totalWeight = signals.reduce((a, s) => a + s.weight, 0);
  const score = Math.round(signals.reduce((a, s) => a + s.score * s.weight, 0) / totalWeight);
  const weakest = [...signals].sort((a, b) => a.score - b.score || b.weight - a.weight)[0];
  return { score, level: levelFor(score), signals, topIssue: weakest.score < 75 ? weakest : null };
}
