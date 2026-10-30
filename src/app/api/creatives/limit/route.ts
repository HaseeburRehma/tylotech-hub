import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { bad, UUID_RE } from "@/lib/creatives-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Set a partner's monthly creative allowance, or clear it with null (team only). Body: { clientId, limit }. */
export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!isStaff(user)) return bad("Forbidden.", 403);
  const b = (await req.json().catch(() => null)) as { clientId?: unknown; limit?: unknown } | null;
  if (typeof b?.clientId !== "string" || !UUID_RE.test(b.clientId)) return bad("Partner not found.", 404);
  const limit = b.limit === null || b.limit === "" ? null : Number(b.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100_000)) return bad("Enter a whole number from 1 to 100,000.");
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);
  const { data, error } = await admin.from("clients").update({ creatives_monthly_limit: limit }).eq("id", b.clientId).select("id");
  if (error) return bad("Could not save the limit.");
  if (!data?.length) return bad("Partner not found.", 404);
  await logAudit(user, { action: "creatives.limit", clientId: b.clientId, targetType: "client", targetId: b.clientId, summary: limit === null ? "no limit" : `${limit} per month` }, admin);
  return NextResponse.json({ ok: true, limit });
}
