import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClient } from "@/lib/integrations/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily automated sync — pulls live KPIs (Meta Ads incl. Leads + Cost-per-Lead,
 * Google Ads, GA4, Search Console) for every client with a connected integration
 * and writes them into the dashboard. This is what makes the "live KPIs" feature
 * actually live instead of manually refreshed.
 *
 * Scheduled via vercel.json. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * when CRON_SECRET is set — we require it so the endpoint can't be triggered
 * anonymously. A `?key=` query param is also accepted for manual/testing runs.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });

  const url = new URL(req.url);
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("key");
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  // Optional ?provider=meta_ads to run just one source; default = all connected.
  const provider = url.searchParams.get("provider") ?? undefined;

  const { data: rows } = await admin
    .from("integrations")
    .select("client_id")
    .eq("status", "connected");
  const clientIds = Array.from(new Set((rows ?? []).map((r) => r.client_id).filter(Boolean))) as string[];

  let totalSynced = 0;
  const perClient: { clientId: string; synced: number }[] = [];
  for (const clientId of clientIds) {
    // notify:false — daily refresh is silent (the dashboard shows it live); the
    // interactive "Sync" button still notifies. auto:false — always refresh here.
    const { synced } = await syncClient(admin, clientId, { provider, auto: false, notify: false });
    totalSynced += synced;
    perClient.push({ clientId, synced });
  }

  return NextResponse.json({ ok: true, clients: clientIds.length, totalSynced, perClient });
}
