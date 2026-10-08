import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMonthlyReportEmail } from "@/lib/email";
import { notifyClientUsers } from "@/lib/notify";
import { MonthlyReportDocument } from "@/lib/pdf/monthly-report-document";
import { buildMonthlyReport, type MonthlyReportData } from "@/lib/reports/monthly";

export async function renderMonthlyPdf(data: MonthlyReportData): Promise<Buffer> {
  const element = createElement(MonthlyReportDocument, {
    data,
    generatedAt: new Date().toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }),
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  return Buffer.from(await renderToBuffer(element));
}

export const reportFilename = (company: string, period: string) =>
  `Monatsbericht-${period}-${company.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "Kunde"}.pdf`;

export interface RunResult {
  status: "sent" | "skipped" | "failed" | "already_sent";
  recipients?: number;
  reason?: string;
}

/**
 * Generate, archive and email one client's monthly report. Idempotent per
 * client + period: a run row is claimed first, so a retry or a second cron
 * invocation can't send the same month twice (unless `force`).
 */
export async function runMonthlyReport(
  admin: SupabaseClient,
  clientId: string,
  period: string,
  opts: { triggeredBy?: string | null; force?: boolean } = {},
): Promise<RunResult> {
  // Claim the run (unique client_id + period).
  const claim = await admin
    .from("report_runs")
    .insert({ client_id: clientId, period, status: "pending", triggered_by: opts.triggeredBy ?? null })
    .select("id")
    .single();
  let runId = claim.data?.id as string | undefined;
  if (claim.error) {
    if (claim.error.code !== "23505") return { status: "failed", reason: claim.error.message };
    const { data: existing } = await admin.from("report_runs").select("id,status,created_at").eq("client_id", clientId).eq("period", period).single();
    if (existing?.status === "sent" && !opts.force) return { status: "already_sent" };
    // A run left "pending" by a timed-out invocation would otherwise block the
    // month forever; after 10 minutes it counts as abandoned and may be retried.
    const stale = existing?.status === "pending" && Date.now() - Date.parse(existing.created_at) > 10 * 60_000;
    if (existing?.status === "pending" && !stale && !opts.force) return { status: "already_sent", reason: "in progress" };
    runId = existing?.id;
    await admin
      .from("report_runs")
      .update({ status: "pending", error: null, triggered_by: opts.triggeredBy ?? null, created_at: new Date().toISOString() })
      .eq("id", runId);
  }
  const finish = (patch: Record<string, unknown>) => admin.from("report_runs").update(patch).eq("id", runId!);

  try {
    const data = await buildMonthlyReport(admin, clientId, period);
    if (!data) {
      await finish({ status: "failed", error: "client not found" });
      return { status: "failed", reason: "client not found" };
    }
    if (!data.hasData) {
      // Don't email a report with nothing in it.
      await finish({ status: "skipped", error: "no data for this month" });
      return { status: "skipped", reason: "no data for this month" };
    }

    const pdf = await renderMonthlyPdf(data);
    const filename = reportFilename(data.company, period);

    // Archive in the client's Documents (replaces an earlier copy of the same month).
    const path = `${clientId}/monthly-report-${period}.pdf`;
    await admin.storage.from("documents").upload(path, pdf, { contentType: "application/pdf", upsert: true });
    const docName = `Monatsbericht ${data.periodLabel}.pdf`;
    await admin.from("documents").delete().eq("client_id", clientId).eq("file_url", path);
    const { data: doc } = await admin
      .from("documents")
      .insert({ client_id: clientId, name: docName, file_url: path, type: "report", size: `${Math.max(1, Math.round(pdf.length / 1024))} KB` })
      .select("id")
      .single();

    // Email every client user of this tenant who hasn't opted out.
    const { data: users } = await admin.from("users").select("id,email").eq("client_id", clientId).eq("role", "client");
    let sent = 0;
    for (const u of (users ?? []) as { id: string; email: string | null }[]) {
      if (!u.email) continue;
      const { data: au } = await admin.auth.admin.getUserById(u.id);
      if (au?.user?.user_metadata?.notify_email === false) continue;
      if (await sendMonthlyReportEmail(u.email, { company: data.company, periodLabel: data.periodLabel, pdf, filename, portalPath: "/documents" })) sent++;
    }

    await notifyClientUsers(clientId, {
      title: `Monatsbericht ${data.periodLabel} ist da`,
      body: "Der Bericht liegt jetzt unter Dokumente.",
      href: "/documents",
      type: "document",
    });

    await finish({ status: "sent", recipients: sent, document_id: doc?.id ?? null, error: sent ? null : "no recipient emailed" });
    return { status: "sent", recipients: sent };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await finish({ status: "failed", error: reason.slice(0, 300) });
    return { status: "failed", reason };
  }
}
