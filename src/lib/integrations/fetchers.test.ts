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
  it("falls back to the largest Meta-attributed lead type when no standard type exists", () => {
    expect(metaLeads([{ action_type: "offsite_content_view_add_meta_leads", value: "30" }, { action_type: "link_click", value: "90" }])).toBe(30);
    expect(metaLeads([{ action_type: "offsite_search_add_meta_leads", value: "12" }, { action_type: "offsite_content_view_add_meta_leads", value: "30" }])).toBe(30);
  });
  it("is 0 without lead actions", () => {
    expect(metaLeads([{ action_type: "link_click", value: "40" }])).toBe(0);
    expect(metaLeads(undefined)).toBe(0);
  });
});
