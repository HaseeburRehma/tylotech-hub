import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { syncClient } from "@/lib/integrations/sync";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`sync:${user.id}`, config.rateLimit.api);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many sync requests." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; provider?: string; auto?: boolean };
  const clientId = user.role === "client" ? user.client_id : body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Tokens and KPI/metric writes go through the service-role client: those columns
  // are revoked from the browser role, and tenant ownership is enforced above.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const { synced, results } = await syncClient(admin, clientId, { provider: body.provider, auto: body.auto });
  return NextResponse.json({ ok: true, synced, results });
}
