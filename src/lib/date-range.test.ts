import { describe, expect, it } from "vitest";
import { addDays, berlinDayStart, berlinToday, inRange, monthGrid, presetRange, previousRange, rangeFromParams, weekday } from "./date-range";

// Wednesday 28 Oct 2026 (the screenshot's Ads Manager: "Last 30 days: Sep 28 – Oct 27").
const TODAY = "2026-10-28";

describe("presets match Meta Ads Manager", () => {
  it("last 30 days ends yesterday", () => {
    expect(presetRange("last_30d", TODAY)).toMatchObject({ since: "2026-09-28", until: "2026-10-27" });
    expect(presetRange("last_7d", TODAY)).toMatchObject({ since: "2026-10-21", until: "2026-10-27" });
    expect(presetRange("last_14d", TODAY)).toMatchObject({ since: "2026-10-14", until: "2026-10-27" });
    expect(presetRange("last_28d", TODAY)).toMatchObject({ since: "2026-09-30", until: "2026-10-27" });
  });
  it("today, yesterday, both", () => {
    expect(presetRange("today", TODAY)).toMatchObject({ since: TODAY, until: TODAY });
    expect(presetRange("yesterday", TODAY)).toMatchObject({ since: "2026-10-27", until: "2026-10-27" });
    expect(presetRange("today_yesterday", TODAY)).toMatchObject({ since: "2026-10-27", until: TODAY });
  });
  it("weeks start Monday; months by calendar", () => {
    expect(weekday(TODAY)).toBe(2);
    expect(presetRange("this_week", TODAY)).toMatchObject({ since: "2026-10-26", until: TODAY });
    expect(presetRange("last_week", TODAY)).toMatchObject({ since: "2026-10-19", until: "2026-10-25" });
    expect(presetRange("this_month", TODAY)).toMatchObject({ since: "2026-10-01", until: TODAY });
    expect(presetRange("last_month", TODAY)).toMatchObject({ since: "2026-09-01", until: "2026-09-30" });
    expect(presetRange("last_month", "2026-01-15")).toMatchObject({ since: "2025-12-01", until: "2025-12-31" });
    expect(presetRange("maximum", TODAY)).toMatchObject({ since: null, until: null });
  });
});

describe("Berlin days", () => {
  it("midnight in Berlin (CET after the clock change, CEST before)", () => {
    expect(new Date(berlinDayStart("2026-10-28")).toISOString()).toBe("2026-10-27T23:00:00.000Z");
    expect(new Date(berlinDayStart("2026-07-01")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });
  it("inRange uses Berlin days, inclusive", () => {
    const r = { preset: "custom" as const, since: "2026-10-27", until: "2026-10-27" };
    expect(inRange("2026-10-26T23:30:00Z", r)).toBe(true); // 00:30 Berlin on the 27th
    expect(inRange("2026-10-26T22:59:00Z", r)).toBe(false);
    expect(inRange("2026-10-27T22:59:59Z", r)).toBe(true);
    expect(inRange("2026-10-27T23:00:00Z", r)).toBe(false); // midnight of the 28th
    expect(inRange("2020-01-01T00:00:00Z", { preset: "maximum", since: null, until: null })).toBe(true);
  });
  it("berlinToday", () => {
    expect(berlinToday(new Date("2026-10-27T23:30:00Z"))).toBe("2026-10-28");
  });
});

describe("helpers", () => {
  it("previous period of the same length", () => {
    expect(previousRange(presetRange("last_7d", TODAY))).toMatchObject({ since: "2026-10-14", until: "2026-10-20" });
    expect(previousRange(presetRange("maximum", TODAY))).toBeNull();
  });
  it("month grid starts Monday and keeps whole weeks", () => {
    const oct = monthGrid(2026, 10);
    expect(oct[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(oct.every((w) => w.length === 7)).toBe(true);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
    expect(monthGrid(2026, 2).flat().filter(Boolean)).toHaveLength(28);
  });
  it("addDays across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("URL params: preset, custom, junk", () => {
    expect(rangeFromParams(new URLSearchParams("range=last_7d"), "maximum", TODAY)).toMatchObject({ preset: "last_7d", since: "2026-10-21" });
    expect(rangeFromParams(new URLSearchParams("from=2026-10-01&to=2026-10-10"), "maximum", TODAY)).toEqual({ preset: "custom", since: "2026-10-01", until: "2026-10-10" });
    expect(rangeFromParams(new URLSearchParams("from=2026-10-10&to=2026-10-01"), "maximum", TODAY).preset).toBe("maximum");
    expect(rangeFromParams(new URLSearchParams("from=<script>&to=x"), "last_30d", TODAY).preset).toBe("last_30d");
  });
});
