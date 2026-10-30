import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { syncMetaLeads } from "@/lib/leads-meta";
import { syncApiLeadSources } from "@/lib/lead-sync-api";
import { syncCreativeSources } from "@/lib/creative-sources";
import { syncSheetLeads } from "@/lib/leads-sheets";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Lead poll, every 20 seconds (supabase/leads_poll_cron.sql). Sheets are read
 * on every tick; each Meta page at most once a minute (Meta throttles harder
 * polling). A tick that finds the previous sheet run still going skips sheets.
 *
 * Originally an every-minute Meta lead poll — the fallback while the Meta app is unpublished
 * (Meta then delivers no real webhooks). Called by Supabase pg_cron + pg_net
 * (supabase/leads_poll_cron.sql) with `Authorization: Bearer $CRON_SECRET`;
 * Vercel's Hobby cron only runs daily. New leads go through the normal alert
 * fan-out (email, urgent push, 60 s screen); duplicates with the webhook or the
 * daily sync are dropped by external id, so nothing alerts twice.
 * The same tick reads connected Google Sheets (website form leads).
 */
async function poll(req: Request) {
  const auth = isCronAuthorized(req);
  if (auth === "unconfigured") return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const t0 = Date.now();
  const sheetsFree = (await getRateLimiter().limit("lead-poll:sheets", { limit: 1, windowSec: 15 })).success;
  const [added, sheets, apis, creatives] = await Promise.all([
    syncMetaLeads(admin, { notify: true, overlapMinutes: 15, activeFormsOnly: true, notifyMaxAgeMinutes: 24 * 60, minIntervalMs: 50_000 }),
    sheetsFree ? syncSheetLeads(admin, { budgetMs: 15_000 }).catch(() => null) : null,
    // HubSpot, Pipedrive, Google Ads lead forms: each at most once a minute.
    syncApiLeadSources(admin, { minIntervalMs: 50_000 }).catch(() => null),
    // Creative folders (Drive, Dropbox, OneDrive): each every 10 minutes, a few per tick.
    syncCreativeSources(admin, { minIntervalMs: 10 * 60_000, budgetMs: 20_000 }).catch(() => null),
  ]);
  return NextResponse.json({ ok: true, added, sheets, apis, creatives, ms: Date.now() - t0 });
}

export const GET = poll;
export const POST = poll;
