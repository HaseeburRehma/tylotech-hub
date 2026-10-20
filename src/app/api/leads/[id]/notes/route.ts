import { NextResponse } from "next/server";
import { bad, leadContext, logLeadActivity } from "@/lib/leads";

export const runtime = "nodejs";

/** Add to a lead's timeline: { kind: "note" | "call" | "email", body }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await leadContext(params.id);
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as { kind?: string; body?: string } | null;
  const kind = b?.kind === "call" || b?.kind === "email" ? b.kind : "note";
  const body = String(b?.body ?? "").trim().slice(0, 4000);
  if (!body && kind === "note") return bad("Write a note first.");
  await logLeadActivity(ctx.admin, ctx.lead, ctx.user.id, kind, body || null);
  // A first call/email on a new lead means it has been contacted.
  if (ctx.lead.status === "new" && (kind === "call" || kind === "email")) {
    await ctx.admin.from("leads").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", ctx.lead.id);
    await logLeadActivity(ctx.admin, ctx.lead, ctx.user.id, "status", null, { from: "new", to: "contacted" });
  }
  return NextResponse.json({ ok: true });
}
