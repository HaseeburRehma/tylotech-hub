import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { LEADS_NOT_READY, bad, ingestLead, leadsContext, missingLeads } from "@/lib/leads";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Add a lead by hand (phone call, walk-in, referral):
 * { clientId? (team), name, email?, phone?, note?, campaign? }.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");
  const ctx = await leadsContext(typeof b.clientId === "string" ? b.clientId : null);
  if ("error" in ctx) return ctx.error;
  const rl = await getRateLimiter().limit(`lead-add:${ctx.user.id}`, { limit: 60, windowSec: 3600 });
  if (!rl.success) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: rateLimitHeaders(rl) });

  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  if (!name && !email && !phone) return bad("Enter at least a name, email or phone number.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Invalid email address.");
  const note = String(b.note ?? "").trim().slice(0, 4000);
  const res = await ingestLead(ctx.admin, {
    clientId: ctx.clientId,
    source: "manual",
    fields: [
      ...(name ? [{ label: "Name", value: name }] : []),
      ...(email ? [{ label: "E-Mail", value: email }] : []),
      ...(phone ? [{ label: "Telefon", value: phone }] : []),
      ...(note ? [{ label: "Notiz", value: note }] : []),
    ],
    contact: { name: name || null, email: email || null, phone: phone || null },
    campaign: typeof b.campaign === "string" ? b.campaign : null,
    platform: "manual",
    actorId: ctx.user.id,
    notify: false,
  });
  if ("error" in res) return missingLeads(res.error) ? bad(LEADS_NOT_READY, 503) : bad("Could not save the lead.");
  await logAudit(ctx.user, { action: "lead.create", clientId: ctx.clientId, targetType: "lead", targetId: res.id, summary: `#${res.lead_no} ${name || email || phone}` }, ctx.admin);
  return NextResponse.json({ ok: true, id: res.id, lead_no: res.lead_no });
}
