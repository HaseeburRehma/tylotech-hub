import { describe, expect, it } from "vitest";
import { waitedFor } from "@/components/chat/inbox-provider";
import { OUTCOMES, countdownState, formatCountdown, formatDuration, remainingSeconds, shouldAlert } from "./speed-to-lead";

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
  it("counts down m:ss, then shows how long it is overdue in growing units", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(47)).toBe("0:47");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-1)).toBe("+1 s");
    expect(formatCountdown(-14)).toBe("+14 s");
    expect(formatCountdown(-75)).toBe("+1 min 15 s");
    expect(formatCountdown(-120)).toBe("+2 min");
    expect(formatCountdown(-(2 * 3600 + 15 * 60 + 9))).toBe("+2 h 15 min");
    expect(formatCountdown(-(3 * 86400 + 4 * 3600))).toBe("+3 d 4 h");
  });
  it("speaks German", () => {
    expect(formatCountdown(-75, "de")).toBe("+1 Min. 15 Sek.");
    expect(formatCountdown(-(26 * 3600), "de")).toBe("+1 Tg. 2 Std.");
  });
});

describe("formatDuration", () => {
  const MIN = 60, H = 3600, D = 86400;
  it("climbs seconds, minutes, hours, days, weeks, months, years", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(59)).toBe("59 s");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(59 * MIN + 59)).toBe("59 min 59 s");
    expect(formatDuration(H)).toBe("1 h");
    expect(formatDuration(23 * H + 59 * MIN + 59)).toBe("23 h 59 min");
    expect(formatDuration(D + 30 * MIN)).toBe("1 d");
    expect(formatDuration(6 * D + 23 * H)).toBe("6 d 23 h");
    expect(formatDuration(15 * D)).toBe("2 wk 1 d");
    expect(formatDuration(42 * D)).toBe("1 mo 1 wk");
    expect(formatDuration(130 * D)).toBe("4 mo 1 wk");
    expect(formatDuration(365 * D)).toBe("1 y");
    expect(formatDuration(500 * D)).toBe("1 y 4 mo");
    expect(formatDuration(5 * 365 * D)).toBe("5 y");
  });
  it("one unit when asked, in German", () => {
    expect(formatDuration(2 * H + 50 * MIN, "de", 1)).toBe("2 Std.");
    expect(formatDuration(45, "de")).toBe("45 Sek.");
    expect(formatDuration(9 * D, "de")).toBe("1 Wo. 2 Tg.");
    expect(formatDuration(400 * D, "de")).toBe("1 J. 1 Mon.");
  });
  it("never breaks on odd input", () => {
    for (const bad of [-5, NaN, Infinity, -Infinity, 0.4]) expect(formatDuration(bad)).toBe("0 s");
    expect(formatDuration(59.99)).toBe("59 s");
    expect(formatDuration(1e12)).toMatch(/^\d+ y( \d+ mo)?$/);
    expect(formatDuration(90, "xx" as "en")).toBe("1 min 30 s");
  });
});

describe("waitedFor", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  it("shows the wait in growing units, at least one second", () => {
    expect(waitedFor("2026-10-31T12:00:00Z", "en", now)).toBe("1 s");
    expect(waitedFor("2026-10-31T11:58:30Z", "en", now)).toBe("1 min 30 s");
    expect(waitedFor("2026-10-31T09:15:00Z", "de", now)).toBe("2 Std. 45 Min.");
    expect(waitedFor("2026-10-29T10:00:00Z", "de", now, 1)).toBe("2 Tg.");
    expect(waitedFor("2026-11-01T00:00:00Z", "en", now)).toBe("1 s"); // clock ahead
  });
});

describe("shouldAlert", () => {
  const now = at("2026-01-01T10:00:05.000Z");
  const base = { status: "new", claimed_at: null, is_test: false, created_at: "2026-01-01T10:00:00.000Z" };
  it("alerts for a fresh, unclaimed, real new lead", () => {
    expect(shouldAlert(base, now)).toBe(true);
  });
  it("alerts for test leads too, so the flow can be verified with a testing tool", () => {
    expect(shouldAlert({ ...base, is_test: true }, now)).toBe(true);
  });
  it("never alerts for claimed or non-new leads", () => {
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
