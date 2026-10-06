import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClient } from "@/lib/integrations/sync";
import { isCronAuthorized } from "@/lib/cron-auth";

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
 * anonymously (header only — see lib/cron-auth).
 */
export async function GET(req: Request) {
  const auth = isCronAuthorized(req);
  if (auth === "unconfigured") return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = new URL(req.url);

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
  // Small parallel batches so a growing client list still fits in maxDuration.
  // notify:false — daily refresh is silent; the interactive "Sync" still notifies.
  for (let i = 0; i < clientIds.length; i += 3) {
    const batch = clientIds.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((clientId) => syncClient(admin, clientId, { provider, auto: false, notify: false }).then((r) => ({ clientId, synced: r.synced }))),
    );
    for (const r of results) {
      totalSynced += r.synced;
      perClient.push(r);
    }
  }

  return NextResponse.json({ ok: true, clients: clientIds.length, totalSynced, perClient });
}
