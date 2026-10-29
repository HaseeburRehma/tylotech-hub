import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { UUID_RE, bad } from "@/lib/leads";
import { apiProviderOf, syncApiLeadSources } from "@/lib/lead-sync-api";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Remove a lead source (its leads stay). Team, or the partner's own people. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!UUID_RE.test(params.id)) return bad("Invalid id.");
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);
  const { data: s } = await admin.from("lead_sources").select("id,client_id,kind,label").eq("id", params.id).maybeSingle();
  if (!s || (!isStaff(user) && s.client_id !== user.client_id)) return bad("Not found.", 404);
  const { error } = await admin.from("lead_sources").delete().eq("id", s.id);
  if (error) return bad("Could not remove the source.");
  await logAudit(user, { action: "lead_source.delete", clientId: s.client_id, targetType: "lead_source", targetId: s.id, summary: `${s.kind}: ${s.label}` }, admin);
  return NextResponse.json({ ok: true });
}

/** Sync one source now: { action: "sync" } (sources we fetch from: HubSpot, Pipedrive, Google Ads). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!UUID_RE.test(params.id)) return bad("Invalid id.");
  const b = (await req.json().catch(() => null)) as { action?: string } | null;
  if (b?.action !== "sync") return bad("Unknown action.");
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);
  const { data: s } = await admin.from("lead_sources").select("id,client_id,kind,config").eq("id", params.id).maybeSingle();
  if (!s || (!isStaff(user) && s.client_id !== user.client_id)) return bad("Not found.", 404);
  if (!apiProviderOf(s)) return bad("This source delivers by itself.");
  const rl = await getRateLimiter().limit(`lead-source-sync:${s.id}`, { limit: 6, windowSec: 60 });
  if (!rl.success) return bad("Just synced. Try again in a moment.", 429);
  const added = await syncApiLeadSources(admin, { sourceId: s.id });
  const { data: after } = await admin.from("lead_sources").select("status,last_error").eq("id", s.id).maybeSingle();
  if (after?.status === "error") return bad(after.last_error ?? "Sync failed.", 502);
  return NextResponse.json({ ok: true, added });
}
