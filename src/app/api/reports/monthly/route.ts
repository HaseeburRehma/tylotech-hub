import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { getClientByRef } from "@/lib/data";
import { getRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { buildMonthlyReport, isPeriod, previousPeriod } from "@/lib/reports/monthly";
import { renderMonthlyPdf, reportFilename, runMonthlyReport } from "@/lib/reports/run";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Download / preview a monthly report PDF. Staff: any client; clients: their own. */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? previousPeriod();
  if (!isPeriod(period)) return NextResponse.json({ error: "period must be YYYY-MM." }, { status: 400 });

  let clientId = user.client_id;
  if (isStaff(user)) {
    const ref = url.searchParams.get("client");
    const c = ref ? await getClientByRef(ref) : null;
    clientId = c?.id ?? null;
  }
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const data = await buildMonthlyReport(admin, clientId, period);
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const pdf = await renderMonthlyPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${reportFilename(data.company, period)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("monthly report render failed:", err);
    return NextResponse.json({ error: "Could not generate the report." }, { status: 500 });
  }
}

/** Staff: send a client's report now (archive + email). */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const rl = await getRateLimiter().limit(`report-send:${user!.id}`, { limit: 10, windowSec: 3600 });
  if (!rl.success) return NextResponse.json({ error: "Too many sends — try again later." }, { status: 429, headers: rateLimitHeaders(rl) });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; period?: string; force?: boolean };
  const period = b.period ?? previousPeriod();
  if (!b.clientId || !isPeriod(period)) return NextResponse.json({ error: "clientId and period (YYYY-MM) are required." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const r = await runMonthlyReport(admin, b.clientId, period, { triggeredBy: user!.id, force: !!b.force });
  if (r.status !== "already_sent") {
    await logAudit(user, {
      action: b.force ? "report.resend" : "report.send",
      clientId: b.clientId,
      targetType: "report",
      targetId: period,
      summary: `${period}: ${r.status}${r.recipients != null ? ` · ${r.recipients} recipient(s)` : ""}${r.reason ? ` · ${r.reason}` : ""}`,
    }, admin);
  }
  const status = r.status === "failed" ? 500 : r.status === "already_sent" ? 409 : 200;
  return NextResponse.json(r, { status });
}
