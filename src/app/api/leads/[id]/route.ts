import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { LEAD_STATUSES, bad, isStaff, leadContext, type LeadStatus } from "@/lib/leads";
import { notifyUser } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * Work a lead: { status?, assignedTo?, appointmentAt?, value?, lostReason?,
 * name?, email?, phone? }. Every change lands in the lead's timeline; a new
 * owner is notified.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await leadContext(params.id);
  if ("error" in ctx) return ctx.error;
  const { user, admin, lead } = ctx;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return bad("Invalid request.");

  const patch: Record<string, unknown> = {};
  const events: { kind: string; body: string | null; meta: Record<string, unknown> }[] = [];

  if (b.status !== undefined) {
    const s = String(b.status) as LeadStatus;
    if (!LEAD_STATUSES.includes(s)) return bad("Unknown status.");
    if (s !== lead.status) {
      patch.status = s;
      events.push({ kind: "status", body: null, meta: { from: lead.status, to: s } });
    }
  }
  if (b.assignedTo !== undefined) {
    const id = b.assignedTo ? String(b.assignedTo) : null;
    if (id) {
      const { data: u } = await admin.from("users").select("id,role,client_id,deactivated_at,name").eq("id", id).maybeSingle();
      const ok = u && !u.deactivated_at && (u.client_id === lead.client_id || ["admin", "team"].includes(u.role));
      if (!ok) return bad("Pick someone from this company or the TyloTech team.");
    }
    if (id !== lead.assigned_to) {
      patch.assigned_to = id;
      events.push({ kind: "assign", body: null, meta: { to: id } });
    }
  }
  if (b.appointmentAt !== undefined) {
    const v = b.appointmentAt ? new Date(String(b.appointmentAt)) : null;
    if (v && Number.isNaN(v.getTime())) return bad("Invalid appointment time.");
    const iso = v ? v.toISOString() : null;
    if (iso !== lead.appointment_at) {
      patch.appointment_at = iso;
      events.push({ kind: "appointment", body: null, meta: { at: iso } });
      // Setting an appointment on an early-stage lead moves it along.
      if (iso && ["new", "contacted", "not_reached"].includes(lead.status) && patch.status === undefined) {
        patch.status = "appointment_set";
        events.push({ kind: "status", body: null, meta: { from: lead.status, to: "appointment_set" } });
      }
    }
  }
  if (b.value !== undefined) {
    const v = b.value === null || b.value === "" ? null : Number(b.value);
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1e9)) return bad("Invalid value.");
    if (v !== (lead.value === null ? null : Number(lead.value))) {
      patch.value = v;
      events.push({ kind: "value", body: null, meta: { value: v } });
    }
  }
  if (b.lostReason !== undefined) patch.lost_reason = String(b.lostReason ?? "").trim().slice(0, 500) || null;
  for (const k of ["name", "email", "phone"] as const) {
    if (b[k] === undefined) continue;
    const v = String(b[k] ?? "").trim().slice(0, k === "email" ? 320 : k === "phone" ? 60 : 200) || null;
    if (k === "email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return bad("Invalid email address.");
    if (v !== lead[k]) {
      patch[k] = k === "email" ? v?.toLowerCase() ?? null : v;
      events.push({ kind: "edit", body: null, meta: { field: k } });
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, lead });

  const now = new Date().toISOString();
  const { data: updated, error } = await admin.from("leads").update({ ...patch, updated_at: now, last_activity_at: now }).eq("id", lead.id).select("*").single();
  if (error || !updated) return bad("Could not save the lead.");
  for (const e of events) await admin.from("lead_activities").insert({ lead_id: lead.id, client_id: lead.client_id, user_id: user.id, kind: e.kind, body: e.body, meta: e.meta });

  if (patch.assigned_to && patch.assigned_to !== user.id) {
    await notifyUser(String(patch.assigned_to), {
      title: `Lead #${lead.lead_no} ist dir zugewiesen`,
      body: `${updated.name ?? updated.email ?? updated.phone ?? ""} · ${user.name}`,
      href: `/leads?lead=${lead.id}`,
      type: "lead",
    }).catch(() => {});
  }
  if (patch.status) await logAudit(user, { action: "lead.status", clientId: lead.client_id, targetType: "lead", targetId: lead.id, summary: `#${lead.lead_no}: ${lead.status} → ${patch.status}` }, admin);
  return NextResponse.json({ ok: true, lead: updated });
}

/** Delete a lead (team only — e.g. GDPR erasure or a test lead). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await leadContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!isStaff(ctx.user)) return bad("Only your TyloTech team can delete leads. Mark it as invalid instead.", 403);
  const { error } = await ctx.admin.from("leads").delete().eq("id", ctx.lead.id);
  if (error) return bad("Could not delete the lead.");
  await logAudit(ctx.user, { action: "lead.delete", clientId: ctx.lead.client_id, targetType: "lead", targetId: ctx.lead.id, summary: `#${ctx.lead.lead_no}` }, ctx.admin);
  return NextResponse.json({ ok: true });
}
