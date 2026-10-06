"use client";

import { Eye, FileText, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export interface ReportRun {
  period: string;
  status: "pending" | "sent" | "failed" | "skipped";
  recipients: number;
  error: string | null;
  created_at: string;
}

/** Last N complete months as YYYY-MM, newest first. */
function recentPeriods(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

const monthLabel = (period: string, locale: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale === "en" ? "en-GB" : "de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
};

export function MonthlyReportPanel({
  clientId,
  enabled,
  recipientCount,
  runs,
  locale,
}: {
  clientId: string;
  enabled: boolean;
  recipientCount: number;
  runs: ReportRun[];
  locale: string;
}) {
  const t = useT();
  const router = useRouter();
  const periods = recentPeriods(6);
  const [period, setPeriod] = useState(periods[0]);
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState<"toggle" | "send" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const already = runs.find((r) => r.period === period && r.status === "sent");

  async function toggle() {
    setBusy("toggle");
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyReportEnabled: !on }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setOn(!on);
      router.refresh();
    } else setNotice({ ok: false, text: t("ait.actionFailed") });
  }

  async function send() {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    setBusy("send");
    setNotice(null);
    const res = await fetch("/api/reports/monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, period, force: !!already }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (d.status === "sent") setNotice({ ok: true, text: t("report.sentOk", { n: d.recipients ?? 0 }) });
    else if (d.status === "skipped") setNotice({ ok: false, text: t("report.skippedNoData") });
    else setNotice({ ok: false, text: d.reason ?? d.error ?? t("ait.actionFailed") });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <FileText className="h-4 w-4 text-muted" /> {t("report.title")}
          </h3>
          <p className="mt-0.5 text-xs text-muted">{t("report.subtitle")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("report.autoSend")}
          disabled={busy === "toggle"}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
            on ? "bg-brand" : "bg-border",
          )}
        >
          <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
        </button>
      </div>
      <p className="mb-4 text-xs text-muted">{on ? t("report.autoOn") : t("report.autoOff")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setConfirm(false);
          }}
          aria-label={t("report.month")}
          className="input-base h-9 w-auto appearance-none py-0 pr-8 text-sm"
        >
          {periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p, locale)}
            </option>
          ))}
        </select>
        <a href={`/api/reports/monthly?client=${clientId}&period=${period}`} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="outline">
            <Eye className="h-4 w-4" /> {t("report.preview")}
          </Button>
        </a>
        <Button
          size="sm"
          onClick={send}
          onBlur={() => setConfirm(false)}
          loading={busy === "send"}
          disabled={recipientCount === 0}
          className={confirm ? "bg-warning text-foreground" : undefined}
        >
          <Mail className="h-4 w-4" />
          {confirm
            ? t(already ? "report.confirmResend" : "report.confirmSend", { n: recipientCount })
            : t(already ? "report.resend" : "report.sendNow")}
        </Button>
      </div>
      {recipientCount === 0 && <p className="mt-2 text-xs text-warning">{t("report.noRecipients")}</p>}
      {notice && (
        <p role="status" className={cn("mt-3 text-sm", notice.ok ? "text-success" : "text-danger")}>
          {notice.text}
        </p>
      )}

      {runs.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
          {runs.map((r) => (
            <li key={r.period} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-foreground">{monthLabel(r.period, locale)}</span>
              <span
                className={cn(
                  r.status === "sent" ? "text-success" : r.status === "failed" ? "text-danger" : "text-muted",
                )}
                title={r.error ?? undefined}
              >
                {t(`report.status.${r.status}`, { n: r.recipients })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
