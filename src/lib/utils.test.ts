import { describe, expect, it } from "vitest";
import { formatCompact, formatCurrency, initials } from "./utils";

describe("utils", () => {
  it("formats currency without decimals", () => {
    expect(formatCurrency(18400)).toContain("18,400");
  });
  it("formats compact numbers", () => {
    expect(formatCompact(12000)).toBe("12K");
  });
  it("derives initials", () => {
    expect(initials("Marcus Holt")).toBe("MH");
    expect(initials("Sofia")).toBe("S");
  });
});
