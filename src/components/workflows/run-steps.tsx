"use client";

import { Check, ChevronDown, Lock, RotateCcw, SkipForward, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useUser } from "@/components/providers/user-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { isOverdue, type Run, type RunStep, type StaffOption } from "@/lib/workflows-shared";

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

async function patchStep(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/workflows/steps/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  return { ok: !!res?.ok, error: (data as { error?: string }).error };
}

/**
 * A run as a vertical rail of steps (dev brief p.4): done → who + when,
 * active → responsible + deadline + "Abhaken", locked → who's next.
 * Expanding a step lets anyone reassign, set a deadline or add a note.
 */
export function RunSteps({ run, staff }: { run: Run; staff: StaffOption[] }) {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? t("wf.formerMember") : null);
  const isAdmin = user.role === "admin";
  const firstLocked = run.steps.find((s) => s.status === "locked")?.id;

  async function act(step: RunStep, body: Record<string, unknown>) {
    setBusy(step.id);
    setError(null);
    const r = await patchStep(step.id, body);
    setBusy(null);
    if (!r.ok) setError(r.error ?? t("ait.actionFailed"));
    router.refresh();
  }

  return (
    <div>
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <ol className="relative">
        {run.steps.map((s, i) => {
          const last = i === run.steps.length - 1;
          const mine = s.assignee_user_id === user.id;
          const overdue = isOverdue(s);
          const canCheck = s.status === "active" && run.status === "active" && (mine || isAdmin);
          const expanded = open === s.id;
          return (
            <li key={s.id} className="relative flex gap-4 pb-1">
              {/* rail */}
              {!last && <span aria-hidden className="absolute left-[19px] top-11 h-[calc(100%-2.25rem)] w-px bg-border" />}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
                  s.status === "done" && "bg-success text-white",
                  s.status === "skipped" && "bg-surface-2 text-muted",
                  s.status === "active" && (run.status === "paused" ? "bg-warning/20 text-warning" : "bg-info text-white"),
                  s.status === "locked" && "bg-surface-2 text-muted/70",
                )}
              >
                {s.status === "done" ? <Check className="h-4 w-4" /> : s.status === "skipped" ? <SkipForward className="h-4 w-4" /> : s.status === "locked" ? <Lock className="h-3.5 w-3.5" /> : i + 1}
              </span>

              <div className={cn("min-w-0 flex-1 border-b border-border/60 pb-4", last && "border-b-0")}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {t("wf.step")} {String(i + 1).padStart(2, "0")}
                    </p>
                    <p className={cn("mt-0.5 font-semibold", s.status === "locked" ? "text-muted" : "text-foreground")}>{s.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      {s.status === "done" && (
                        <>
                          <span className="font-semibold uppercase tracking-wide text-success">{t("wf.state.done")}</span>
                          <span className="text-muted">
                            {t("wf.by")} {nameOf(s.completed_by) ?? "—"}
                            {s.completed_at ? ` · ${fmtStamp(s.completed_at)}` : ""}
                          </span>
                        </>
                      )}
                      {s.status === "skipped" && (
                        <>
                          <span className="font-semibold uppercase tracking-wide text-muted">{t("wf.state.skipped")}</span>
                          <span className="text-muted">
                            {t("wf.by")} {nameOf(s.completed_by) ?? "—"}
                            {s.completed_at ? ` · ${fmtStamp(s.completed_at)}` : ""}
                          </span>
                        </>
                      )}
                      {s.status === "active" && (
                        <>
                          <span className={cn("font-semibold uppercase tracking-wide", run.status === "paused" ? "text-warning" : "text-info")}>
                            ● {run.status === "paused" ? t("wf.state.paused") : t("wf.state.active")}
                            {mine && run.status === "active" ? ` · ${t("wf.yourTurn")}` : ""}
                          </span>
                          <span className="text-muted">
                            {t("wf.responsible")}: {nameOf(s.assignee_user_id) ?? <em>{t("wf.unassigned")}</em>}
                          </span>
                          {s.due_date && (
                            <span className={overdue ? "font-medium text-danger" : "text-muted"}>
                              · {overdue ? t("wf.overdueSince") : t("wf.due")} {fmtDate(s.due_date)}
                            </span>
                          )}
                        </>
                      )}
                      {s.status === "locked" && (
                        <>
                          <span className="font-semibold uppercase tracking-wide text-muted/70">{t("wf.state.locked")}</span>
                          <span className="text-muted">
                            {t("wf.responsible")}: {nameOf(s.assignee_user_id) ?? t("wf.unassigned")}
                            {s.id === firstLocked && run.status !== "completed" ? ` · ${t("wf.autoActivates")}` : ""}
                          </span>
                        </>
                      )}
                    </p>
                    {s.note && !expanded && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
                        <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-2">{s.note}</span>
                      </p>
                    )}
                  </div>
                  <ChevronDown className={cn("mt-5 h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
                </button>

                {s.status === "active" && run.status === "active" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      loading={busy === s.id}
                      disabled={!canCheck}
                      onClick={() => act(s, { action: "complete" })}
                      title={canCheck ? undefined : s.assignee_user_id ? t("wf.onlyAssignee") : t("wf.assignFirst")}
                    >
                      <Check className="h-4 w-4" /> {t("wf.checkOff")}
                    </Button>
                    {!s.assignee_user_id && (
                      <Button size="sm" variant="secondary" disabled={busy === s.id} onClick={() => act(s, { assigneeUserId: user.id })}>
                        {t("wf.takeIt")}
                      </Button>
                    )}
                  </div>
                )}

                {expanded && (
                  <StepEditor
                    step={s}
                    staff={staff}
                    busy={busy === s.id}
                    isAdmin={isAdmin}
                    runActive={run.status === "active"}
                    onSave={(body) => act(s, body)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepEditor({
  step,
  staff,
  busy,
  isAdmin,
  runActive,
  onSave,
}: {
  step: RunStep;
  staff: StaffOption[];
  busy: boolean;
  isAdmin: boolean;
  runActive: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [assignee, setAssignee] = useState(step.assignee_user_id ?? "");
  const [due, setDue] = useState(step.due_date ?? "");
  const [note, setNote] = useState(step.note ?? "");
  const dirty = assignee !== (step.assignee_user_id ?? "") || due !== (step.due_date ?? "") || note !== (step.note ?? "");

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-2/40 p-3">
      {step.instructions && <p className="whitespace-pre-line text-sm text-muted">{step.instructions}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`as-${step.id}`}>{t("wf.responsible")}</Label>
          <select id={`as-${step.id}`} value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input-base h-10 appearance-none py-0 text-sm">
            <option value="">{t("wf.unassigned")}</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.title ? ` · ${m.title}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor={`due-${step.id}`}>{t("wf.deadline")}</Label>
          <input id={`due-${step.id}`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input-base h-10 py-0 text-sm" />
        </div>
      </div>
      <div>
        <Label htmlFor={`note-${step.id}`}>{t("wf.note")}</Label>
        <Textarea id={`note-${step.id}`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="min-h-[70px] text-sm" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!dirty || busy}
          loading={busy}
          onClick={() =>
            onSave({
              ...(assignee !== (step.assignee_user_id ?? "") ? { assigneeUserId: assignee || null } : {}),
              ...(due !== (step.due_date ?? "") ? { dueDate: due || null } : {}),
              ...(note !== (step.note ?? "") ? { note } : {}),
            })
          }
        >
          {t("common.save")}
        </Button>
        {isAdmin && step.status === "active" && runActive && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave({ action: "skip" })}>
            <SkipForward className="h-4 w-4" /> {t("wf.skip")}
          </Button>
        )}
        {isAdmin && (step.status === "done" || step.status === "skipped") && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave({ action: "reopen" })}>
            <RotateCcw className="h-4 w-4" /> {t("wf.reopen")}
          </Button>
        )}
      </div>
    </div>
  );
}
