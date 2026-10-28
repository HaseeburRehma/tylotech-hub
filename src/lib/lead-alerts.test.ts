import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPush = vi.fn();
const mockEmail = vi.fn();
vi.mock("@/lib/push", () => ({ sendPush: (...a: unknown[]) => mockPush(...a) }));
vi.mock("@/lib/email", () => ({ sendLeadEmail: (...a: unknown[]) => mockEmail(...a) }));

import { alertNewLead, forgetLeadEmailPref, type AlertLead } from "./lead-alerts";

const CLIENT = "c-1";
const PEOPLE = [
  { id: "u-partner", role: "client", client_id: CLIENT, email: "sales@partner.de" },
  { id: "u-partner-off", role: "client", client_id: CLIENT, email: "old@partner.de", deactivated_at: "2026-01-01" },
  { id: "u-other", role: "client", client_id: "c-2", email: "x@other.de" }, // must never get it
  { id: "u-admin", role: "admin", client_id: null, email: "admin@tylotech.de" },
  { id: "u-team", role: "team", client_id: null, email: null },
];

let inserted: any[] = [];
// Auth metadata per user (the email preference); a throwing lookup is allowed for.
let meta: Record<string, Record<string, unknown> | "throw"> = {};
const lookups: string[] = [];
const admin: any = {
  auth: {
    admin: {
      getUserById: async (id: string) => {
        lookups.push(id);
        if (meta[id] === "throw") throw new Error("auth down");
        return { data: { user: { id, user_metadata: meta[id] ?? {} } } };
      },
    },
  },
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
  meta = {};
  lookups.length = 0;
  for (const p of PEOPLE) forgetLeadEmailPref(p.id);
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

  it("emails the partner right away; staff only when they switched lead emails on", async () => {
    const r = await alertNewLead(admin, LEAD);
    expect(mockEmail.mock.calls.map((c) => c[0])).toEqual(["sales@partner.de"]);
    expect(mockEmail.mock.calls[0][1]).toMatchObject({ partner: "Nouh-Wehres", leadNo: 47, phone: "+49 170 1234567", source: "Meta", isTest: false });
    expect(r).toMatchObject({ emailsSent: 1, emailsSkipped: 1 });
    // Push + in-app still reach every staff member.
    expect(inserted.map((n) => n.user_id)).toContain("u-admin");
  });

  it("staff who opted in get the email; a partner who opted out doesn't", async () => {
    meta = { "u-admin": { lead_email: true }, "u-partner": { lead_email: false } };
    const r = await alertNewLead(admin, LEAD);
    expect(mockEmail.mock.calls.map((c) => c[0])).toEqual(["admin@tylotech.de"]);
    expect(mockEmail.mock.calls[0][1].path).toBe("/leads?client=nouh-wehres&lead=l-1");
    expect(r.emailsSkipped).toBe(1);
  });

  it("the messages switch (notify_email) doesn't silence lead emails", async () => {
    meta = { "u-partner": { notify_email: false } };
    await alertNewLead(admin, LEAD);
    expect(mockEmail.mock.calls.map((c) => c[0])).toEqual(["sales@partner.de"]);
  });

  it("if the preference can't be read, the role's default applies", async () => {
    meta = { "u-partner": "throw", "u-admin": "throw" };
    await alertNewLead(admin, LEAD);
    expect(mockEmail.mock.calls.map((c) => c[0])).toEqual(["sales@partner.de"]);
  });

  it("a burst of leads looks each person up once (60 s cache); a changed setting is re-read", async () => {
    for (let i = 0; i < 5; i++) await alertNewLead(admin, { ...LEAD, id: `l-${i}`, lead_no: 100 + i });
    expect(lookups.filter((x) => x === "u-admin")).toHaveLength(1);
    expect(mockEmail).toHaveBeenCalledTimes(5);
    meta = { "u-admin": { lead_email: true } };
    forgetLeadEmailPref("u-admin");
    mockEmail.mockClear();
    await alertNewLead(admin, LEAD);
    expect(mockEmail.mock.calls.map((c) => c[0]).sort()).toEqual(["admin@tylotech.de", "sales@partner.de"]);
  });

  it("labels test leads and survives a failing email", async () => {
    mockEmail.mockRejectedValueOnce(new Error("resend down"));
    const r = await alertNewLead(admin, { ...LEAD, is_test: true, name: null });
    expect(inserted[0].title).toBe("Test-Lead #47: max@example.com");
    expect(r.emailsSent).toBe(0);
  });
});
