import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { LEADS_NOT_READY, bad, leadContext, missingLeads } from "@/lib/leads";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

const missingClaim = (msg: string | undefined) => /lead_claim|claimed_at|function|does not exist|schema cache/i.test(msg ?? "");

/**
 * Claim a lead (Speed-to-Lead). Atomic: the first caller wins, everyone else
 * gets 409 "already taken". `{ call: true }` also stamps the first-call time and
 * returns the phone so the app can open the dialer. One claim per lead.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await leadContext(params.id);
  if ("error" in ctx && ctx.error) return ctx.error;
  if (!("admin" in ctx)) return bad("Could not claim the lead.");
  const { user, admin, lead } = ctx;

  const rl = await getRateLimiter().limit(`lead-claim:${user.id}`, { limit: 120, windowSec: 60 });
  if (!rl.success) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });

  const body = (await req.json().catch(() => ({}))) as { call?: boolean };
  const call = body.call === true;

  const { data: rows, error } = await admin.rpc("lead_claim", { p_lead: lead.id, p_user: user.id, p_call: call });
  if (error) return missingLeads(error.message) || missingClaim(error.message) ? bad(LEADS_NOT_READY, 503) : bad("Could not claim the lead.");

  const claimed = Array.isArray(rows) ? rows[0] : rows;
  if (!claimed) {
    // Lost the race — tell them who holds it now.
    const { data: cur } = await admin.from("leads").select("claimed_by, claimed:claimed_by(name)").eq("id", lead.id).maybeSingle();
    const name = (cur?.claimed as { name?: string } | null)?.name ?? null;
    const mine = cur?.claimed_by === user.id;
    return NextResponse.json({ error: "already_claimed", mine, claimedByName: name }, { status: 409 });
  }

  await admin.from("lead_activities").insert({ lead_id: lead.id, client_id: lead.client_id, user_id: user.id, kind: "assign", body: null, meta: { claim: true } });
  if (call) await admin.from("lead_activities").insert({ lead_id: lead.id, client_id: lead.client_id, user_id: user.id, kind: "call", body: null, meta: { via: "speed-to-lead" } });
  await logAudit(user, { action: "lead.claim", clientId: lead.client_id, targetType: "lead", targetId: lead.id, summary: `#${lead.lead_no}${call ? " · call" : ""}` }, admin);

  return NextResponse.json({ ok: true, lead: claimed });
}
