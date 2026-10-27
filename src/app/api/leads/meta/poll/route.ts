import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { syncMetaLeads } from "@/lib/leads-meta";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Every-minute Meta lead poll — the fallback while the Meta app is unpublished
 * (Meta then delivers no real webhooks). Called by Supabase pg_cron + pg_net
 * (supabase/leads_poll_cron.sql) with `Authorization: Bearer $CRON_SECRET`;
 * Vercel's Hobby cron only runs daily. New leads go through the normal alert
 * fan-out (email, urgent push, 60 s screen); duplicates with the webhook or the
 * daily sync are dropped by external id, so nothing alerts twice.
 */
async function poll(req: Request) {
  const auth = isCronAuthorized(req);
  if (auth === "unconfigured") return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const t0 = Date.now();
  const added = await syncMetaLeads(admin, { notify: true, overlapMinutes: 15, activeFormsOnly: true, notifyMaxAgeMinutes: 24 * 60 });
  return NextResponse.json({ ok: true, added, ms: Date.now() - t0 });
}

export const GET = poll;
export const POST = poll;
