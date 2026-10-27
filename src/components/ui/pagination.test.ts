import { describe, expect, it } from "vitest";
import { pageList } from "./pagination";

describe("pageList", () => {
  it("short lists show every page", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageList(1, 0)).toEqual([]);
  });
  it("start, middle and end of a long list (280 leads / 25 = 12 pages)", () => {
    expect(pageList(1, 12)).toEqual([1, 2, 3, 4, "…", 12]);
    expect(pageList(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
    expect(pageList(12, 12)).toEqual([1, "…", 9, 10, 11, 12]);
  });
  it("never shows a gap for a single missing page", () => {
    expect(pageList(4, 12)).toEqual([1, 2, 3, 4, 5, "…", 12]);
    expect(pageList(9, 12)).toEqual([1, "…", 8, 9, 10, 11, 12]);
  });
  it("always includes first, last and current, in order, without duplicates", () => {
    for (let total = 1; total <= 40; total++) {
      for (let cur = 1; cur <= total; cur++) {
        const l = pageList(cur, total);
        const nums = l.filter((x): x is number => x !== "…");
        expect(nums[0]).toBe(1);
        expect(nums[nums.length - 1]).toBe(total);
        expect(nums).toContain(cur);
        expect([...nums].sort((a, b) => a - b)).toEqual(nums);
        expect(new Set(nums).size).toBe(nums.length);
        expect(l.length).toBeLessThanOrEqual(7);
      }
    }
  });
});
