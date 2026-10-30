"use client";

import { BadgeCheck, CircleDashed, MessageSquareWarning, Send, ShieldCheck, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Approval, ApprovalStatus, RunStep, StaffOption } from "@/lib/workflows-shared";
import { AttachmentIcon } from "./step-attachments";
import { useRefresh } from "@/components/providers/refresh-provider";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

export function ApprovalBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  const t = useT();
  const v = status === "approved" ? "success" : status === "changes_requested" ? "danger" : status === "pending" ? "warning" : "neutral";
  const Icon = status === "approved" ? BadgeCheck : status === "changes_requested" ? MessageSquareWarning : status === "pending" ? CircleDashed : Undo2;
  return (
    <Badge variant={v} className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" /> {t(`approval.status.${status}`)}
    </Badge>
  );
}

/**
 * Client approvals on a step: history (who asked, what the partner decided,
 * their comment) and "Ask the partner for approval" with chosen attachments.
 */
export function StepApprovals({ step, staff, partner }: { step: RunStep; staff: StaffOption[]; partner: string }) {
  const t = useT();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = step.approvals ?? [];
  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name ?? partner : "-");

  async function cancel(a: Approval) {
    setBusy(a.id);
    setError(null);
    const res = await fetch(`/api/approvals/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "cancel" }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? t("ait.actionFailed"));
    refresh();
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> {t("approval.title")}
        </p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Send className="h-3.5 w-3.5" /> {t("approval.request")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("approval.none", { partner })}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border border-border bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <ApprovalBadge status={a.status} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{a.title}</span>
                {a.status === "pending" && (
                  <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => cancel(a)}>
                    <X className="h-3.5 w-3.5" /> {t("approval.withdraw")}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-caption text-muted">
                {t("approval.askedBy", { name: nameOf(a.requested_by), when: stamp(a.requested_at) })}
                {a.decided_at && a.status !== "cancelled" ? ` · ${t("approval.decidedBy", { name: nameOf(a.decided_by), when: stamp(a.decided_at) })}` : ""}
              </p>
              {a.decision_comment && <p className="mt-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs text-foreground">“{a.decision_comment}”</p>}
            </li>
          ))}
        </ul>
      )}
      {open && <RequestApprovalModal step={step} partner={partner} onClose={() => setOpen(false)} onDone={() => refresh()} />}
    </div>
  );
}

function RequestApprovalModal({ step, partner, onClose, onDone }: { step: RunStep; partner: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const files = step.attachments ?? [];
  const [title, setTitle] = useState(step.title);
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<string[]>(() => files.map((f) => f.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/workflows/steps/${step.id}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, attachmentIds: picked }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? t("ait.actionFailed"));
    onDone();
    onClose();
  }

  return (
    <ModalShell open onClose={onClose} className="max-w-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-brand-ink" /> {t("approval.requestTitle", { partner })}
        </h2>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <Label htmlFor="ap-title">{t("approval.what")}</Label>
          <input id="ap-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="input-base h-10 py-0 text-sm" />
        </div>
        <div>
          <Label htmlFor="ap-msg">{t("approval.message")}</Label>
          <Textarea id="ap-msg" value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} placeholder={t("approval.messagePh")} className="min-h-[80px] text-sm" />
        </div>
        <div>
          <Label>{t("approval.files")}</Label>
          {files.length === 0 ? (
            <p className="text-xs text-muted">{t("approval.noFiles")}</p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((f) => {
                const on = picked.includes(f.id);
                return (
                  <li key={f.id}>
                    <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm", on ? "border-brand bg-brand/5" : "border-border")}>
                      <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))} className="h-4 w-4 accent-brand" />
                      <AttachmentIcon a={f} className="h-4 w-4 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-xs text-muted">{t("approval.notifyHint", { partner })}</p>
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!title.trim() || (!picked.length && !message.trim())} onClick={send}>
            <Send className="h-4 w-4" /> {t("approval.send")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
