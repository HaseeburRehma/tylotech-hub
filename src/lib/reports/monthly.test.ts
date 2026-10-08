import { describe, expect, it } from "vitest";
import { berlinMidnightUtc } from "./monthly";

describe("berlinMidnightUtc", () => {
  it("handles summer (CEST, UTC+2) and winter (CET, UTC+1)", () => {
    expect(berlinMidnightUtc("2026-10-01")).toBe("2026-09-30T22:00:00.000Z");
    expect(berlinMidnightUtc("2026-12-01")).toBe("2026-11-30T23:00:00.000Z");
  });
});
