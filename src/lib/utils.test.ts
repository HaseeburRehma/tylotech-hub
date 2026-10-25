import { describe, expect, it } from "vitest";
import { cn, formatCompact, formatCurrency, initials } from "./utils";

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

describe("cn", () => {
  it("keeps a named font size next to a text colour", () => {
    expect(cn("text-caption text-muted")).toBe("text-caption text-muted");
    expect(cn("text-brand-ink", "text-eyebrow")).toBe("text-brand-ink text-eyebrow");
  });
  it("still lets a later font size win", () => {
    expect(cn("text-sm", "text-body-sm")).toBe("text-body-sm");
  });
});
