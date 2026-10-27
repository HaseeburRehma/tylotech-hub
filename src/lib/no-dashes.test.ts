import { describe, expect, it } from "vitest";
import { withoutEmDashes } from "./no-dashes";

describe("withoutEmDashes", () => {
  it("turns clause dashes into commas and bare dashes into hyphens", () => {
    expect(withoutEmDashes("Stop scrolling — this changes everything")).toBe("Stop scrolling, this changes everything");
    expect(withoutEmDashes("2020—2024")).toBe("2020-2024");
    expect(withoutEmDashes("a  —\nb")).toBe("a, b");
  });
  it("leaves en dashes, hyphens and normal text alone", () => {
    expect(withoutEmDashes("28–38 years, well-known")).toBe("28–38 years, well-known");
  });
});
