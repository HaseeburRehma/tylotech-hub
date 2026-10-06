import { describe, expect, it } from "vitest";
import { computeHealth, levelFor, type HealthInput } from "./health";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const day = (n: number) => daysAgo(n).slice(0, 10);

const base = (over: Partial<HealthInput> = {}): HealthInput => ({
  now: NOW,
  clientCreatedAt: daysAgo(200),
  integrations: [{ status: "connected", lastSyncedAt: daysAgo(0) }],
  adPoints: [],
  messages: [{ createdAt: daysAgo(2), fromStaff: true }],
  updates: [{ createdAt: daysAgo(5) }],
  projects: [],
  ...over,
});

const points = (from: number, to: number, leads: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ date: day(from + i), leads }));

describe("computeHealth", () => {
  it("scores an active, connected, updated client as healthy", () => {
    const h = computeHealth(base());
    expect(h.level).toBe("healthy");
    expect(h.score).toBe(100);
    expect(h.topIssue).toBeNull();
  });

  it("flags an unanswered client message as the top issue", () => {
    const h = computeHealth(base({ messages: [{ createdAt: daysAgo(8), fromStaff: false }] }));
    expect(h.topIssue?.reason).toBe("health.r.unanswered");
    expect(h.topIssue?.params?.days).toBe(8);
    expect(h.level).not.toBe("healthy");
  });

  it("penalises missing and broken data sources", () => {
    expect(computeHealth(base({ integrations: [] })).signals.find((s) => s.key === "connections")?.score).toBe(0);
    const err = computeHealth(base({ integrations: [{ status: "error", lastSyncedAt: daysAgo(10) }] }));
    expect(err.signals.find((s) => s.key === "connections")?.reason).toBe("health.r.sourceErrors");
  });

  it("only scores the lead trend like-for-like", () => {
    // Previous window empty → no trend signal (not a fake growth).
    expect(computeHealth(base({ adPoints: points(1, 20, 2) })).signals.some((s) => s.key === "trend")).toBe(false);
    // Populated windows → real change.
    const down = computeHealth(base({ adPoints: [...points(31, 55, 4), ...points(1, 25, 1)] }));
    const t = down.signals.find((s) => s.key === "trend");
    expect(t?.reason).toBe("health.r.leadsDown");
    expect(t?.score).toBe(10);
  });

  it("counts overdue and blocked projects", () => {
    const h = computeHealth(base({ projects: [{ status: "in_progress", due: day(3) }, { status: "blocked", due: null }] }));
    expect(h.signals.find((s) => s.key === "delivery")?.score).toBe(40);
  });

  it("gives new clients a grace period instead of a risk flag", () => {
    const h = computeHealth(base({ clientCreatedAt: daysAgo(3), messages: [], updates: [] }));
    expect(h.signals.map((s) => s.key)).toEqual(["connections"]);
    expect(h.score).toBeNull();
    expect(h.level).toBe("unknown");
  });

  it("maps scores to levels", () => {
    expect(levelFor(80)).toBe("healthy");
    expect(levelFor(60)).toBe("watch");
    expect(levelFor(20)).toBe("risk");
    expect(levelFor(null)).toBe("unknown");
  });
});
