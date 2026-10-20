import { NextResponse } from "next/server";
import { loadApprovals, missingApprovals } from "@/lib/approvals";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Approvals for the signed-in client's company (staff: ?clientId=). ?status=pending to filter. */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const clientId = isStaff(user) ? q.get("clientId") : user.client_id;
  if (!clientId || !UUID_RE.test(clientId)) return NextResponse.json({ approvals: [] });
  const status = q.get("status") === "pending" ? ["pending"] : undefined;
  const { data, error } = await loadApprovals(admin, { clientId, status });
  if (error) return NextResponse.json({ approvals: [], unavailable: missingApprovals(error) });
  // Withdrawn requests are only interesting to the team.
  return NextResponse.json({ approvals: isStaff(user) ? data : data.filter((a) => a.status !== "cancelled") });
}
