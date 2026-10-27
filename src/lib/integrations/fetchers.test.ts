import { describe, expect, it } from "vitest";
import { metaLeads } from "./fetchers";

describe("metaLeads", () => {
  it("prefers the aggregate lead action regardless of order", () => {
    expect(metaLeads([{ action_type: "offsite_conversion.fb_pixel_lead", value: "3" }, { action_type: "lead", value: "5" }])).toBe(5);
    expect(metaLeads([{ action_type: "lead", value: "5" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "3" }])).toBe(5);
  });
  it("falls back to specific types in priority order, never summing", () => {
    expect(metaLeads([{ action_type: "offsite_conversion.fb_pixel_lead", value: "2" }, { action_type: "onsite_conversion.lead_grouped", value: "4" }])).toBe(4);
  });
  it("never counts Meta's *_add_meta_leads events (content views, searches) as leads", () => {
    // Light of Hope, Oct 2026: 556 content views, 0 real leads.
    expect(metaLeads([{ action_type: "offsite_content_view_add_meta_leads", value: "556" }, { action_type: "link_click", value: "90" }])).toBe(0);
    expect(metaLeads([{ action_type: "offsite_search_add_meta_leads", value: "12" }, { action_type: "offsite_complete_registration_add_meta_leads", value: "30" }])).toBe(0);
  });
  it("falls back to other real lead events (custom conversions ending in lead)", () => {
    expect(metaLeads([{ action_type: "offsite_conversion.custom.123_lead", value: "7" }, { action_type: "offsite_content_view_add_meta_leads", value: "500" }])).toBe(7);
    expect(metaLeads([{ action_type: "onsite_conversion.messaging_lead_grouped", value: "4" }])).toBe(4);
  });
  it("still uses the aggregate when Meta sends it alongside the noise (Nouh-Wehres)", () => {
    expect(
      metaLeads([
        { action_type: "offsite_content_view_add_meta_leads", value: "3" },
        { action_type: "lead", value: "3" },
        { action_type: "onsite_conversion.lead_grouped", value: "3" },
      ]),
    ).toBe(3);
  });
  it("is 0 without lead actions", () => {
    expect(metaLeads([{ action_type: "link_click", value: "40" }])).toBe(0);
    expect(metaLeads(undefined)).toBe(0);
  });
});
