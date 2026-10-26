import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPush = vi.fn();
const mockEmail = vi.fn();
vi.mock("@/lib/push", () => ({ sendPush: (...a: unknown[]) => mockPush(...a) }));
vi.mock("@/lib/email", () => ({ sendLeadEmail: (...a: unknown[]) => mockEmail(...a) }));

import { alertNewLead, type AlertLead } from "./lead-alerts";

const CLIENT = "c-1";
const PEOPLE = [
  { id: "u-partner", role: "client", client_id: CLIENT, email: "sales@partner.de" },
  { id: "u-partner-off", role: "client", client_id: CLIENT, email: "old@partner.de", deactivated_at: "2026-01-01" },
  { id: "u-other", role: "client", client_id: "c-2", email: "x@other.de" }, // must never get it
  { id: "u-admin", role: "admin", client_id: null, email: "admin@tylotech.de" },
  { id: "u-team", role: "team", client_id: null, email: null },
];

let inserted: any[] = [];
const admin: any = {
  from: (t: string) => {
    if (t === "clients") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { company: "Nouh-Wehres", slug: "nouh-wehres" } }) }) }) };
    if (t === "users") return { select: () => ({ or: async () => ({ data: PEOPLE }) }) };
    if (t === "notifications") return { insert: async (rows: any[]) => ((inserted = rows), { error: null }) };
    throw new Error(t);
  },
};

const LEAD: AlertLead = {
  id: "l-1",
  lead_no: 47,
  client_id: CLIENT,
  source: "meta",
  name: "Max Muster",
  email: "max@example.com",
  phone: "+49 170 1234567",
  campaign: "Heizung Herbst",
  form: null,
  fields: [{ label: "PLZ", value: "40233" }],
  is_test: false,
  created_at: "2026-10-26T15:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  inserted = [];
  mockPush.mockResolvedValue(undefined);
  mockEmail.mockResolvedValue(true);
});

describe("alertNewLead", () => {
  it("alerts the partner's active users and the TyloTech team — no one else", async () => {
    const r = await alertNewLead(admin, LEAD);
    expect(inserted.map((n) => n.user_id).sort()).toEqual(["u-admin", "u-partner", "u-team"]);
    expect(r.recipients).toBe(3);
  });

  it("links staff to the partner by slug and the partner to their own list", async () => {
    await alertNewLead(admin, LEAD);
    const href = Object.fromEntries(inserted.map((n) => [n.user_id, n.href]));
    expect(href["u-partner"]).toBe("/leads?lead=l-1");
    expect(href["u-admin"]).toBe("/leads?client=nouh-wehres&lead=l-1");
    expect(inserted[0].title).toBe("Neuer Lead #47: Max Muster");
    expect(inserted[0].type).toBe("lead");
  });

  it("sends urgent lead pushes carrying the id and creation time for the countdown", async () => {
    await alertNewLead(admin, LEAD);
    expect(mockPush).toHaveBeenCalledTimes(2);
    const calls = mockPush.mock.calls.map((c) => ({ ids: c[1], n: c[2] }));
    expect(calls.find((c) => c.ids.includes("u-partner"))!.ids).toEqual(["u-partner"]);
    const staff = calls.find((c) => c.ids.includes("u-admin"))!;
    expect(staff.ids.sort()).toEqual(["u-admin", "u-team"]);
    expect(staff.n).toMatchObject({ type: "lead", urgent: true, href: "/leads?client=nouh-wehres&lead=l-1", data: { leadId: "l-1", createdAt: LEAD.created_at } });
  });

  it("emails everyone with an address right away, with the lead's details", async () => {
    const r = await alertNewLead(admin, LEAD);
    expect(mockEmail.mock.calls.map((c) => c[0]).sort()).toEqual(["admin@tylotech.de", "sales@partner.de"]);
    expect(mockEmail.mock.calls[0][1]).toMatchObject({ partner: "Nouh-Wehres", leadNo: 47, phone: "+49 170 1234567", source: "Meta", isTest: false });
    expect(r.emailsSent).toBe(2);
  });

  it("labels test leads and survives a failing email", async () => {
    mockEmail.mockRejectedValueOnce(new Error("resend down"));
    const r = await alertNewLead(admin, { ...LEAD, is_test: true, name: null });
    expect(inserted[0].title).toBe("Test-Lead #47: max@example.com");
    expect(r.emailsSent).toBe(1);
  });
});
