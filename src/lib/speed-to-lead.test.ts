import { describe, expect, it } from "vitest";
import { OUTCOMES, countdownState, formatCountdown, remainingSeconds, shouldAlert } from "./speed-to-lead";

const at = (iso: string) => new Date(iso).getTime();

describe("remainingSeconds + state", () => {
  const created = at("2026-01-01T10:00:00.000Z");
  it("is 60 at the moment the lead arrives, counting down", () => {
    expect(remainingSeconds(created, created)).toBe(60);
    expect(remainingSeconds(created, created + 15_000)).toBe(45);
    expect(remainingSeconds(created, created + 59_500)).toBe(1);
  });
  it("goes negative once overdue", () => {
    expect(remainingSeconds(created, created + 74_000)).toBe(-14);
  });
  it("colours green > 30, amber 10–30, red ≤ 10, overdue ≤ 0", () => {
    expect(countdownState(45)).toBe("green");
    expect(countdownState(30)).toBe("amber");
    expect(countdownState(11)).toBe("amber");
    expect(countdownState(10)).toBe("red");
    expect(countdownState(1)).toBe("red");
    expect(countdownState(0)).toBe("overdue");
    expect(countdownState(-14)).toBe("overdue");
  });
});

describe("formatCountdown", () => {
  it("counts down m:ss, then +m:ss overdue", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(47)).toBe("0:47");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-14)).toBe("+0:14");
    expect(formatCountdown(-75)).toBe("+1:15");
  });
});

describe("shouldAlert", () => {
  const now = at("2026-01-01T10:00:05.000Z");
  const base = { status: "new", claimed_at: null, is_test: false, created_at: "2026-01-01T10:00:00.000Z" };
  it("alerts for a fresh, unclaimed, real new lead", () => {
    expect(shouldAlert(base, now)).toBe(true);
  });
  it("never alerts for test leads, claimed leads or non-new leads", () => {
    expect(shouldAlert({ ...base, is_test: true }, now)).toBe(false);
    expect(shouldAlert({ ...base, claimed_at: "2026-01-01T10:00:02.000Z" }, now)).toBe(false);
    expect(shouldAlert({ ...base, status: "contacted" }, now)).toBe(false);
  });
  it("does not pop a blocking card for a lead that arrived long ago (app just opened)", () => {
    expect(shouldAlert(base, at("2026-01-01T10:05:00.000Z"))).toBe(false);
  });
});

describe("OUTCOMES", () => {
  it("map one-tap outcomes to valid internal lead statuses", () => {
    expect(OUTCOMES.map((o) => o.status)).toEqual(["appointment_set", "won", "not_reached", "lost", "invalid"]);
  });
});
