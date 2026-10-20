import { NextResponse } from "next/server";
import { handleLeadgenEvent, metaWebhookVerifyToken, verifyMetaSignature } from "@/lib/leads-meta";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Meta webhook verification (hub.challenge). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = metaWebhookVerifyToken();
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Page "leadgen" events: signed by Meta (X-Hub-Signature-256) → fetch and store each lead. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("Bad signature", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("Not configured", { status: 503 });
  const body = JSON.parse(raw || "{}") as { object?: string; entry?: { changes?: { field?: string; value?: Record<string, string> }[] }[] };
  if (body.object !== "page") return NextResponse.json({ ok: true });
  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field === "leadgen" && ch.value) await handleLeadgenEvent(admin, ch.value).catch(() => 0);
    }
  }
  // Always 200 once verified — Meta retries otherwise and may disable the subscription.
  return NextResponse.json({ ok: true });
}
