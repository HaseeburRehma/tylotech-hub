import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { isCronAuthorized } from "@/lib/cron-auth";
import { previousPeriod } from "@/lib/reports/monthly";
import { runMonthlyReport } from "@/lib/reports/run";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 1st of each month: email last month's report to every opted-in, active client. */
export async function GET(req: Request) {
  const auth = isCronAuthorized(req);
  if (auth === "unconfigured") return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const period = previousPeriod();
  const { data: clients } = await admin.from("clients").select("*").eq("monthly_report_enabled", true);
  const active = (clients ?? []).filter((c: any) => !c.archived_at);

  const results: { client: string; status: string; recipients?: number }[] = [];
  // Three clients at a time keeps the run inside the function time limit; a
  // client whose run times out is retried by the next invocation (stale pending).
  const one = async (c: { id: string }) => {
    const r = await runMonthlyReport(admin, c.id, period);
    results.push({ client: c.id, status: r.status, recipients: r.recipients });
    if (r.status !== "already_sent") {
      await logAudit(null, {
        action: "report.auto",
        clientId: c.id,
        targetType: "report",
        targetId: period,
        summary: `${period}: ${r.status}${r.recipients != null ? ` · ${r.recipients} recipient(s)` : ""}${r.reason ? ` · ${r.reason}` : ""}`,
      }, admin);
    }
  };
  for (let i = 0; i < active.length; i += 3) await Promise.all(active.slice(i, i + 3).map(one));
  return NextResponse.json({ ok: true, period, clients: active.length, results });
}
