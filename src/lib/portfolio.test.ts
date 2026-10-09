import { describe, expect, it } from "vitest";
import { combinePortfolio } from "./portfolio";

describe("combinePortfolio", () => {
  it("sums counts and spend-weights ROAS for ad platforms", () => {
    const out = combinePortfolio([
      { date: "2026-10-01", provider: "meta_ads", spend: 100, leads: 2, roas: 3 },
      { date: "2026-10-01", provider: "meta_ads", spend: 300, leads: 1, roas: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ spend: 400, leads: 3, roas: 1.5 }); // (300+300)/400
  });
  it("sums Search Console clicks/impressions and weights position by impressions", () => {
    const out = combinePortfolio([
      { date: "2026-10-01", provider: "search_console", spend: 0, leads: 10, roas: 100, position: 4 },
      { date: "2026-10-01", provider: "search_console", spend: 0, leads: 5, roas: 300, position: 12 },
    ]);
    expect(out[0]).toMatchObject({ leads: 15, roas: 400, position: 10 }); // (400+3600)/400
  });
  it("keeps providers and days apart, sorted by date", () => {
    const out = combinePortfolio([
      { date: "2026-10-02", provider: "ga4", spend: 0, leads: 5, roas: 9 },
      { date: "2026-10-01", provider: "ga4", spend: 0, leads: 1, roas: 2 },
      { date: "2026-10-01", provider: "search_console", spend: 0, leads: 1, roas: 2 },
    ]);
    expect(out.map((p) => `${p.date}:${p.provider}`)).toEqual(["2026-10-01:ga4", "2026-10-01:search_console", "2026-10-02:ga4"]);
  });
});
