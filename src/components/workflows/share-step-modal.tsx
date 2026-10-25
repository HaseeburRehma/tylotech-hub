"use client";

import { Check, MessageSquare, Send, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { useUser } from "@/components/providers/user-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Run, RunStep, StaffOption } from "@/lib/workflows-shared";

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Share a step to the team chat or as a direct message. The post carries the
 * step, who's responsible, the deadline, the note, every attachment (as links
 * that open for the team) and a link back to the process. Everyone picked
 * under "Notify" is @mentioned and gets an alert (in-app, push, email).
 */
export function ShareStepModal({
  open,
  onClose,
  run,
  step,
  partner,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  run: Run;
  step: RunStep;
  partner: string;
  staff: StaffOption[];
}) {
  const t = useT();
  const user = useUser();
  const others = useMemo(() => staff.filter((s) => s.id !== user.id), [staff, user.id]);
  const [target, setTarget] = useState<"team" | "dm">("team");
  const [dmTo, setDmTo] = useState("");
  const [notify, setNotify] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Fresh state each time it opens; the responsible person is pre-selected.
  useEffect(() => {
    if (!open) return;
    const who = step.assignee_user_id && step.assignee_user_id !== user.id ? [step.assignee_user_id] : [];
    setTarget("team");
    setDmTo(who[0] ?? others[0]?.id ?? "");
    setNotify(who);
    setMessage("");
    setError(null);
    setSent(false);
  }, [open, step.assignee_user_id, user.id, others]);

  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? "—" : null);
  const index = run.steps.findIndex((s) => s.id === step.id);
  const status = t(`wf.state.${run.status === "paused" && step.status === "active" ? "paused" : step.status}`);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const content = useMemo(() => {
    const mentions = notify.map((id) => `@${nameOf(id)}`).join(" ");
    const lines = [
      [mentions, message.trim()].filter(Boolean).join(" "),
      `📋 ${run.name} · ${partner}${run.iteration && run.iteration > 1 ? ` · ${t("wf.round", { n: run.iteration })}` : ""}`,
      `**${t("wf.step")} ${index + 1}/${run.steps.length}: ${step.title}** — ${status}`,
      [
        `👤 ${t("wf.responsible")}: ${nameOf(step.assignee_user_id) ?? t("wf.unassigned")}`,
        step.due_date ? `⏰ ${t("wf.deadline")}: ${fmtDate(step.due_date)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      step.note ? `📝 ${step.note}` : null,
      ...(step.attachments ?? []).map((a) => `📎 ${a.name}: ${a.kind === "link" ? a.url : `${origin}/api/workflows/attachments/${a.id}`}`),
      `🔗 ${origin}/internal/processes/${run.id}`,
    ];
    return lines.filter((l) => l && l.trim()).join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, message, run, step, partner, origin, status, index]);

  async function send() {
    setBusy(true);
    setError(null);
    const recipientId = target === "dm" ? dmTo : null;
    const mentions = Array.from(new Set(recipientId ? notify.filter((id) => id !== recipientId) : notify));
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, internal: true, recipientId, mentions }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      return setError((d as { error?: string }).error ?? t("ait.actionFailed"));
    }
    setSent(true);
  }

  const toggle = (id: string) => setNotify((n) => (n.includes(id) ? n.filter((x) => x !== id) : [...n, id]));

  return (
    <ModalShell open={open} onClose={onClose} className="max-w-xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <MessageSquare className="h-4 w-4 text-brand-ink" /> {t("wf.share.title")}
        </h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label={t("common.close")}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {sent ? (
        <div className="space-y-4 p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" />
          </span>
          <p className="font-medium text-foreground">{t("wf.share.sent")}</p>
          <p className="text-sm text-muted">{notify.length ? t("wf.share.notified", { n: notify.length }) : t(target === "team" ? "wf.share.sentTeam" : "wf.share.sentDm")}</p>
          <div className="flex justify-center gap-2">
            <ButtonLink href="/internal/team" size="sm" variant="secondary">{t("wf.share.openChat")}</ButtonLink>
            <Button size="sm" onClick={onClose}>{t("common.close")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div>
            <Label>{t("wf.share.where")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["team", "dm"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTarget(k)}
                  aria-pressed={target === k}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    target === k ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {k === "team" ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                  {t(k === "team" ? "wf.share.team" : "wf.share.dm")}
                </button>
              ))}
            </div>
            {target === "dm" && (
              <select value={dmTo} onChange={(e) => setDmTo(e.target.value)} className="input-base mt-2 h-10 appearance-none py-0 text-sm" aria-label={t("wf.share.dm")}>
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.title ? ` · ${m.title}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <Label>{t("wf.share.notify")}</Label>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {others.map((m) => {
                const on = notify.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors",
                      on ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted hover:text-foreground",
                    )}
                  >
                    <Avatar name={m.name} size={20} />
                    {m.name}
                    {on && <Check className="h-3 w-3 text-brand-ink" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-3 text-caption">
              <button type="button" className="text-muted hover:text-foreground" onClick={() => setNotify(others.map((o) => o.id))}>
                {t("wf.share.all")}
              </button>
              <button type="button" className="text-muted hover:text-foreground" onClick={() => setNotify([])}>
                {t("wf.share.none")}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="share-msg">{t("wf.share.message")}</Label>
            <Textarea id="share-msg" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder={t("wf.share.messagePh")} className="min-h-[64px] text-sm" />
          </div>

          <div>
            <Label>{t("wf.share.preview")}</Label>
            <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-2/50 p-3 font-sans text-xs text-foreground">
              {/* Same **bold** the chat renders */}
              {content.split(/\*\*([^*\n]+)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}
            </pre>
          </div>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button loading={busy} disabled={target === "dm" && !dmTo} onClick={send}>
              <Send className="h-4 w-4" /> {t("wf.share.send")}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
