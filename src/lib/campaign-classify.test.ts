import { describe, expect, it } from "vitest";
import { classifyLeads, type CampaignStat, type LeadForClassify } from "./campaign-classify";

const META: CampaignStat[] = [
  {
    id: "c1",
    name: "Franchise Ads",
    platform: "meta",
    spend: 95.65,
    impressions: 12000,
    clicks: 300,
    platformLeads: 23,
    ads: [
      { id: "a1", name: "VIDEO 2 — Raus aus dem Job", adset: "Test Creative Angles", spend: 60, impressions: 7000, clicks: 200, platformLeads: 15, thumbnail: "https://x/1.jpg" },
      { id: "a2", name: "VIDEO 3 — Niedrige Hürde (ab 40.000 €)", adset: "Test Creative Angles", spend: 35.65, impressions: 5000, clicks: 100, platformLeads: 8, thumbnail: null },
    ],
  },
  { id: "c2", name: "Leads - Zählerschrank austauschen", platform: "meta", spend: 0, impressions: 0, clicks: 0, platformLeads: 0, ads: [] },
];
const GOOGLE: CampaignStat[] = [
  { id: "g1", name: "Search DE", platform: "google", spend: 140, impressions: 900, clicks: 80, platformLeads: 3, ads: [{ id: "ag1", name: "Depression", adset: null, spend: 140, impressions: 900, clicks: 80, platformLeads: 3, thumbnail: null }] },
];

let n = 0;
const lead = (p: Partial<LeadForClassify>): LeadForClassify => ({ id: `l${++n}`, source: "meta", platform: "instagram", campaign: "Franchise Ads", ad_group: "Test Creative Angles", ad: "VIDEO 2 — Raus aus dem Job", status: "new", is_test: false, ...p });

describe("classifyLeads", () => {
  it("matches Meta leads to campaign and creative; CPL = spend / TyloHQ leads", () => {
    const leads = [lead({}), lead({}), lead({ ad: "VIDEO 3 — Niedrige Hürde (ab 40.000 €)" }), lead({ status: "won" })];
    const { rows, totals } = classifyLeads(leads, META);
    expect(rows).toHaveLength(1); // the campaign without spend or leads is hidden
    const c = rows[0];
    expect(c).toMatchObject({ name: "Franchise Ads", kind: "meta", spend: 95.65, platformLeads: 23, leads: 4, won: 1, cpl: 23.91 });
    expect(c.ads.map((a) => [a.name, a.leads, a.cpl])).toEqual([
      ["VIDEO 2 — Raus aus dem Job", 3, 20],
      ["VIDEO 3 — Niedrige Hürde (ab 40.000 €)", 1, 35.65],
    ]);
    expect(c.ads[0].thumbnail).toBe("https://x/1.jpg");
    expect(totals).toMatchObject({ spend: 95.65, leads: 4, cpl: 23.91, unmatched: 0 });
  });

  it("names are matched loosely (case, spaces), not by exact bytes", () => {
    const { rows } = classifyLeads([lead({ campaign: "  franchise   ADS ", ad: "video 2 — raus aus dem job" })], META);
    expect(rows[0].leads).toBe(1);
    expect(rows[0].ads[0].leads).toBe(1);
  });

  it("test and invalid leads don't count", () => {
    const { rows } = classifyLeads([lead({ is_test: true }), lead({ status: "invalid" }), lead({})], META);
    expect(rows[0].leads).toBe(1);
  });

  it("a Meta campaign without spend in the range keeps its own row (spend 0, no CPL)", () => {
    const { rows } = classifyLeads([lead({ campaign: "Leads - Testing - Zählerschrank Erneuerung", ad: "Creative A" })], META);
    expect(rows.find((r) => r.name.startsWith("Leads - Testing"))).toMatchObject({ name: "Leads - Testing - Zählerschrank Erneuerung", kind: "meta", spend: 0, leads: 1, cpl: null });
  });

  it("website leads: grouped by the ad click they came from, no invented spend", () => {
    const leads = [
      lead({ source: "webhook", platform: "google", campaign: null, ad: null }),
      lead({ source: "webhook", platform: "google", campaign: null, ad: null }),
      lead({ source: "webhook", platform: "facebook", campaign: null, ad: null }),
      lead({ source: "webhook", platform: "website", campaign: null, ad: null }),
      lead({ source: "manual", platform: null, campaign: null, ad: null }),
      lead({ source: "meta", campaign: "Organisch", ad: null }),
    ];
    const { rows, totals } = classifyLeads(leads, [...META, ...GOOGLE], "en");
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by["Website, via Google ad"]).toMatchObject({ leads: 2, spend: null, cpl: null });
    expect(by["Website, via Meta ad"].leads).toBe(1);
    expect(by["Website / direct"].leads).toBe(1);
    expect(by["Added by hand"].leads).toBe(1);
    expect(by["Meta organic"].leads).toBe(1);
    // Google campaign shows its spend even without matched leads.
    expect(by["Search DE"]).toMatchObject({ spend: 140, leads: 0, cpl: null });
    expect(totals.unmatched).toBe(6);
    // Paid spend over leads from paid campaigns only (none here): no CPL.
    expect(totals.cpl).toBeNull();
  });

  it("a website lead with utm_campaign matching a Google campaign counts there", () => {
    const { rows } = classifyLeads([lead({ source: "webhook", platform: "google", campaign: "Search DE", ad: null })], GOOGLE);
    expect(rows[0]).toMatchObject({ name: "Search DE", leads: 1, cpl: 140 });
  });

  it("sorted by spend, then leads; lead ids kept for filtering", () => {
    const leads = [lead({}), lead({ source: "webhook", platform: "website", campaign: null, ad: null })];
    const { rows } = classifyLeads(leads, [...META, ...GOOGLE]);
    expect(rows.map((r) => r.name)).toEqual(["Search DE", "Franchise Ads", "Website / direkt"]);
    expect(rows[1].leadIds).toHaveLength(1);
  });
});
