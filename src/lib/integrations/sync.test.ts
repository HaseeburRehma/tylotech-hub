import { describe, expect, it } from "vitest";
import { generateMetrics } from "./sync";
import { getProvider } from "./providers";

describe("generateMetrics", () => {
  it("returns every metric key for a provider", () => {
    const provider = getProvider("meta_ads")!;
    const m = generateMetrics("meta_ads", 42);
    for (const def of provider.metrics) {
      expect(typeof m[def.key]).toBe("number");
    }
  });

  it("is deterministic for the same seed", () => {
    expect(generateMetrics("google_ads", 7)).toEqual(generateMetrics("google_ads", 7));
  });

  it("returns an empty object for unknown providers", () => {
    expect(generateMetrics("nope" as any, 1)).toEqual({});
  });
});
