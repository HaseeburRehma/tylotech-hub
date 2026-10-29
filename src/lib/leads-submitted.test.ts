import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/lead-alerts", () => ({ alertNewLead: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), isStaff: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { leadRow, submittedAt } from "./leads";

const NOW = Date.UTC(2026, 9, 29, 9, 46, 0);

describe("submittedAt", () => {
  it("keeps real submit times, past or a moment ahead (clock skew)", () => {
    expect(submittedAt("2026-10-29T09:40:00Z", NOW)).toBe("2026-10-29T09:40:00.000Z");
    expect(submittedAt("2026-10-29T09:47:30Z", NOW)).toBe("2026-10-29T09:47:30.000Z");
  });
  it("never stores a lead in the future (wrong sheet zone, bad form clock)", () => {
    expect(submittedAt("2026-10-29T10:45:44Z", NOW)).toBe(new Date(NOW).toISOString());
    expect(submittedAt("2099-01-01T00:00:00Z", NOW)).toBe(new Date(NOW).toISOString());
  });
  it("missing or broken times become now", () => {
    expect(submittedAt(null, NOW)).toBe(new Date(NOW).toISOString());
    expect(submittedAt("gestern", NOW)).toBe(new Date(NOW).toISOString());
  });
  it("leadRow uses it", () => {
    const row = leadRow({ clientId: "c", source: "webhook", fields: [], createdAt: "2099-01-01T00:00:00Z" } as never);
    expect(Date.parse(row.created_at)).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
