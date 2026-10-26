import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mockLeadContext = vi.fn();
const mockLimit = vi.fn();

// Minimal stand-in so the route under test doesn't pull in @/lib/auth (React cache).
vi.mock("@/lib/leads", () => ({
  leadContext: (id: string) => mockLeadContext(id),
  bad: (error: string, status = 400) => NextResponse.json({ error }, { status }),
  LEADS_NOT_READY: "Leads need database migration.",
  missingLeads: (msg: string | undefined) => /\bleads\b|lead_sources|lead_activities|schema cache|does not exist/i.test(msg ?? ""),
}));
vi.mock("@/lib/rate-limit", () => ({
  getRateLimiter: () => ({ limit: (...a: unknown[]) => mockLimit(...a) }),
  rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { POST } from "./route";
import { jsonReq } from "@/test-utils";

const LEAD = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const lead = { id: LEAD, client_id: "c1", lead_no: 7, phone: "+49 170 1", claimed_at: null };

/** admin whose rpc + follow-up queries are scripted per test. */
function admin({ rpc, claimer }: { rpc: { data: unknown; error: unknown }; claimer?: { claimed_by: string | null; claimed: { name: string } | null } }) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: claimer ?? null, error: null });
  const q: Record<string, any> = { insert, select: () => q, eq: () => q, maybeSingle };
  return { rpc: vi.fn().mockResolvedValue(rpc), from: vi.fn(() => q), _insert: insert };
}

async function call(body: unknown = {}): Promise<Response> {
  const res = await POST(jsonReq(`http://localhost/api/leads/${LEAD}/claim`, body), { params: { id: LEAD } });
  if (!res) throw new Error("route returned nothing");
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLimit.mockResolvedValue({ success: true });
});

describe("POST /api/leads/[id]/claim", () => {
  it("passes leadContext errors through (auth / tenant isolation)", async () => {
    mockLeadContext.mockResolvedValue({ error: NextResponse.json({ error: "Lead not found." }, { status: 404 }) });
    expect((await call()).status).toBe(404);
  });

  it("claims atomically and records the activity", async () => {
    const a = admin({ rpc: { data: [{ ...lead, claimed_by: ME, claimed_at: "t" }], error: null } });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: a, lead });
    const res = await call();
    expect(res.status).toBe(200);
    expect(a.rpc).toHaveBeenCalledWith("lead_claim", { p_lead: LEAD, p_user: ME, p_call: false });
    expect(a._insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "assign", meta: { claim: true } }));
  });

  it("call=true stamps the call and logs a call activity", async () => {
    const a = admin({ rpc: { data: [{ ...lead, claimed_by: ME }], error: null } });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: a, lead });
    await call({ call: true });
    expect(a.rpc).toHaveBeenCalledWith("lead_claim", { p_lead: LEAD, p_user: ME, p_call: true });
    expect(a._insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "call" }));
  });

  it("loses the race → 409 with the winner's name", async () => {
    const a = admin({ rpc: { data: [], error: null }, claimer: { claimed_by: OTHER, claimed: { name: "Anna" } } });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: a, lead });
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "already_claimed", mine: false, claimedByName: "Anna" });
  });

  it("already mine → 409 mine:true (so the card just shows the outcome step)", async () => {
    const a = admin({ rpc: { data: [], error: null }, claimer: { claimed_by: ME, claimed: { name: "Me" } } });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: a, lead });
    const body = await (await call()).json();
    expect(body.mine).toBe(true);
  });

  it("returns 503 naming migration 0046 when the claim function is missing", async () => {
    // The exact PostgREST wording on production before 0046 is applied.
    const a = admin({ rpc: { data: null, error: { code: "PGRST202", message: "Could not find the function public.lead_claim(p_call, p_lead, p_user) in the schema cache" } } });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: a, lead });
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/0046/);
  });

  it("does not blame a missing migration for an ordinary database error", async () => {
    const a = admin({ rpc: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } } });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: a, lead });
    const res = await call();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Could not claim the lead.");
  });

  it("rate-limits rapid claims", async () => {
    mockLimit.mockResolvedValue({ success: false });
    mockLeadContext.mockResolvedValue({ user: { id: ME }, admin: admin({ rpc: { data: [], error: null } }), lead });
    expect((await call()).status).toBe(429);
  });
});
