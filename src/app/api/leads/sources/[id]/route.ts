import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { UUID_RE, bad } from "@/lib/leads";
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
