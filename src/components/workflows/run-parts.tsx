"use client";

import { Pause, Play, Repeat, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/components/providers/user-provider";
import { useT, useIntlLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { activeStep, isOverdue, runProgress, type Run, type RunStatus, type StaffOption } from "@/lib/workflows-shared";
import { APP_TZ } from "@/lib/utils";
import { useRefresh } from "@/components/providers/refresh-provider";

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const t = useT();
  const variant = status === "completed" ? "success" : status === "paused" ? "warning" : "info";
  return <Badge variant={variant}>{t(`wf.run.${status}`)}</Badge>;
}

/** "40 % (2/5 erledigt)" + bar. */
export function RunProgress({ run, className }: { run: Run; className?: string }) {
  const t = useT();
  const p = runProgress(run.steps);
  return (
    <div className={className}>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{t("wf.progress", { pct: p.pct, done: p.finished, total: p.total })}</span>
      </div>
      <Progress value={p.pct} tone={run.status === "completed" ? "success" : "brand"} />
    </div>
  );
}

/** Title row of a run with pause/resume (any team member) and delete (admin). */
export function RunHeader({ run, partner, partnerHref }: { run: Run; partner: string; partnerHref?: string }) {
  const t = useT();
  const dl = useIntlLocale();
  const user = useUser();
  const router = useRouter();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user.role === "admin";
  const [repeatEvery, setRepeatEvery] = useState(run.repeat_every ?? "");

  async function call(method: "PATCH" | "DELETE" | "POST", body?: unknown, suffix = "") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/workflows/runs/${run.id}${suffix}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError((d as { error?: string }).error ?? t("ait.actionFailed"));
      return false;
    }
    return (await res.json().catch(() => ({}))) as { id?: string };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{run.name}</h2>
            <RunStatusBadge status={run.status} />
            {(run.iteration ?? 1) > 1 && <Badge variant="neutral">{t("wf.round", { n: run.iteration ?? 1 })}</Badge>}
            {run.repeat_every && (
              <Badge variant="neutral">
                <Repeat className="mr-1 h-3 w-3" />
                {t(`wf.repeat.${run.repeat_every}`)}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {t("wf.for")}{" "}
            {partnerHref ? (
              <Link href={partnerHref} className="text-foreground hover:underline">
                {partner}
              </Link>
            ) : (
              partner
            )}{" "}
            · {t("wf.startedOn")} {new Date(run.started_at).toLocaleDateString(dl, { timeZone: APP_TZ, day: "2-digit", month: "2-digit", year: "numeric" })}
            {run.repeated_from && (
              <>
                {" "}
                ·{" "}
                <Link href={`/internal/processes/${run.repeated_from}`} className="hover:text-foreground hover:underline">
                  {t("wf.prevRound")}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <select
              value={repeatEvery}
              disabled={busy}
              onChange={async (e) => {
                const v = e.target.value;
                const prev = repeatEvery;
                setRepeatEvery(v);
                if (await call("PATCH", { repeatEvery: v || null })) refresh();
                else setRepeatEvery(prev);
              }}
              className="input-base h-8 w-auto appearance-none py-0 pr-7 text-xs"
              aria-label={t("wf.repeat.label")}
              title={t("wf.repeat.hint")}
            >
              <option value="">{t("wf.repeat.off")}</option>
              <option value="week">{t("wf.repeat.week")}</option>
              <option value="month">{t("wf.repeat.month")}</option>
            </select>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              title={t("wf.runAgainHint")}
              onClick={async () => {
                const r = await call("POST", undefined, "/repeat");
                if (r && r.id) router.push(`/internal/processes/${r.id}`);
              }}
            >
              <RotateCw className="h-4 w-4" /> {t("wf.runAgain")}
            </Button>
          )}
          {run.status === "active" && (
            <Button size="sm" variant="secondary" loading={busy} onClick={async () => (await call("PATCH", { status: "paused" })) && refresh()}>
              <Pause className="h-4 w-4" /> {t("wf.pause")}
            </Button>
          )}
          {run.status === "paused" && (
            <Button size="sm" variant="secondary" loading={busy} onClick={async () => (await call("PATCH", { status: "active" })) && refresh()}>
              <Play className="h-4 w-4" /> {t("wf.resume")}
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant={confirm ? "danger" : "ghost"}
              disabled={busy}
              onBlur={() => setConfirm(false)}
              onClick={async () => {
                if (!confirm) return setConfirm(true);
                if (await call("DELETE")) router.push("/internal/processes");
              }}
              aria-label={t("wf.delete")}
            >
              <Trash2 className="h-4 w-4" /> {confirm ? t("wf.confirmDelete") : null}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <RunProgress run={run} />
    </div>
  );
}

/** Compact card: progress, current step, who's on it, overdue. */
export function RunCard({ run, partner, staff, showPartner = true }: { run: Run; partner: string; staff: StaffOption[]; showPartner?: boolean }) {
  const t = useT();
  const dl = useIntlLocale();
  const step = activeStep(run.steps);
  const who = step?.assignee_user_id ? staff.find((s) => s.id === step.assignee_user_id)?.name : null;
  const overdue = step ? isOverdue(step) : false;
  return (
    <Link
      href={`/internal/processes/${run.id}`}
      className={cn("block rounded-xl border bg-surface p-4 transition-colors hover:border-brand/40", overdue ? "border-danger/40" : "border-border")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{run.name}</p>
          {showPartner && <p className="truncate text-xs text-muted">{partner}</p>}
        </div>
        <RunStatusBadge status={run.status} />
      </div>
      <RunProgress run={run} className="mt-3" />
      {step && (
        <p className="mt-3 text-xs text-muted">
          <span className="text-foreground">{step.title}</span> · {who ?? <em>{t("wf.unassigned")}</em>}
          {step.due_date && (
            <span className={overdue ? "font-medium text-danger" : ""}>
              {" "}
              · {overdue ? t("wf.overdueSince") : t("wf.due")}{" "}
              {new Date(`${step.due_date}T00:00:00Z`).toLocaleDateString(dl, { day: "2-digit", month: "2-digit", timeZone: "UTC" })}
            </span>
          )}
        </p>
      )}
    </Link>
  );
}
