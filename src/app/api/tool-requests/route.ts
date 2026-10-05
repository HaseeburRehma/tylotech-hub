import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/notify";

export const runtime = "nodejs";

const FREQUENCIES = ["daily", "weekly", "monthly", "rarely"];

/** A user asks TyloTech for a custom AI tool — delivered to all staff. */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const rl = await getRateLimiter().limit(`tool-request:${user.id}`, { limit: 5, windowSec: 3600 });
  if (!rl.success) return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429, headers: rateLimitHeaders(rl) });

  const b = (await req.json().catch(() => ({}))) as { what?: string; clientId?: string; frequency?: string; manual?: string };
  const what = String(b.what ?? "").trim().slice(0, 2000);
  if (!what) return NextResponse.json({ error: "Describe what the tool should do." }, { status: 400 });
  const manual = String(b.manual ?? "").trim().slice(0, 1000);
  const frequency = FREQUENCIES.includes(String(b.frequency)) ? String(b.frequency) : "weekly";

  // Clients always request for their own company; staff may name a client.
  let forWhom = "all clients";
  if (!isStaff(user)) {
    forWhom = user.company ?? "their company";
  } else if (b.clientId) {
    const admin = createAdminClient();
    const { data } = admin ? await admin.from("clients").select("company").eq("id", b.clientId).maybeSingle() : { data: null };
    if (data?.company) forWhom = data.company;
  }

  const body = [what, `For: ${forWhom} · Frequency: ${frequency}`, manual ? `Done manually today: ${manual}` : ""]
    .filter(Boolean)
    .join("\n");

  await notifyStaff({
    title: `AI tool request from ${user.name}${user.company && !isStaff(user) ? ` (${user.company})` : ""}`,
    body: body.slice(0, 1000),
    href: "/internal/ai-tools",
    type: "info",
    email: { senderName: user.name, preview: body },
  });

  return NextResponse.json({ ok: true });
}
