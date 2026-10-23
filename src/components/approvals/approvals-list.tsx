"use client";

import { ArrowRight, Check, ExternalLink, FileText, Image as ImageIcon, Link2, MessageSquareWarning, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AttachmentViewer, type ViewerItem } from "@/components/chat/attachment-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useUser } from "@/components/providers/user-provider";
import { ApprovalBadge } from "@/components/workflows/step-approvals";
import { useT } from "@/lib/i18n/provider";
import type { Approval } from "@/lib/workflows-shared";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

const fileUrl = (a: Approval, attId: string) => `/api/approvals/${a.id}/files/${attId}?v=1`;

/**
 * Approval requests for one partner: open ones first with one-click
 * "Approve" or "Request changes" (with a comment), then the history.
 * The team sees the same list read-only.
 */
export function ApprovalsList({ approvals }: { approvals: Approval[] }) {
  const t = useT();
  const user = useUser();
  const isClient = user.role === "client";
  const open = approvals.filter((a) => a.status === "pending");
  const done = approvals.filter((a) => a.status !== "pending");

  if (!approvals.length) {
    return (
      <Card className="flex flex-col items-center gap-2 py-12 text-center">
        <ShieldCheck className="h-10 w-10 text-muted/30" />
        <p className="font-medium text-foreground">{t("approval.emptyTitle")}</p>
        <p className="max-w-sm text-sm text-muted">{t("approval.emptyText")}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("approval.open", { n: open.length })}</h2>
          {open.map((a) => (
            <ApprovalCard key={a.id} a={a} canDecide={isClient} />
          ))}
        </section>
      )}
      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted">{t("approval.history")}</h2>
          {done.map((a) => (
            <ApprovalCard key={a.id} a={a} canDecide={false} />
          ))}
        </section>
      )}
    </div>
  );
}

function ApprovalCard({ a, canDecide }: { a: Approval; canDecide: boolean }) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const files = a.files ?? [];
  const viewable: ViewerItem[] = files
    .filter((f) => f.kind === "file")
    .map((f) => ({ id: f.id, name: f.name, mime: f.mime ?? "application/octet-stream", url: fileUrl(a, f.id), sender: a.requested_by_name ?? "TyloTech", createdAt: a.requested_at }));

  async function decide(decision: "approve" | "changes") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/approvals/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? t("ait.actionFailed"));
    router.refresh();
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{a.title}</p>
          <p className="text-xs text-muted">
            {[a.run_name, t("approval.askedBy", { name: a.requested_by_name ?? "TyloTech", when: stamp(a.requested_at) })].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ApprovalBadge status={a.status} />
      </div>
      {a.message && <p className="whitespace-pre-line text-sm text-foreground">{a.message}</p>}
      {files.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f.id}>
              {f.kind === "link" ? (
                <a href={f.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm hover:border-brand/40">
                  <Link2 className="h-4 w-4 shrink-0 text-brand-ink" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setViewer(viewable.findIndex((v) => v.id === f.id))}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-left text-sm hover:border-brand/40"
                >
                  {f.mime?.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0 text-brand-ink" /> : <FileText className="h-4 w-4 shrink-0 text-brand-ink" />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {a.decided_at && a.status !== "pending" && a.status !== "cancelled" && (
        <p className="text-xs text-muted">
          {t("approval.decidedBy", { name: a.decided_by_name ?? "—", when: stamp(a.decided_at) })}
          {a.decision_comment ? ` — “${a.decision_comment}”` : ""}
        </p>
      )}
      {canDecide && a.status === "pending" && (
        <div className="space-y-2 border-t border-border pt-3">
          {mode === "changes" ? (
            <>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder={t("approval.changesPh")} className="min-h-[80px] text-sm" autoFocus />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
                  {t("common.cancel")}
                </Button>
                <Button variant="secondary" size="sm" loading={busy} disabled={!comment.trim()} onClick={() => decide("changes")}>
                  <MessageSquareWarning className="h-4 w-4" /> {t("approval.sendChanges")}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={() => decide("approve")}>
                <Check className="h-4 w-4" /> {t("approval.approve")}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setMode("changes")}>
                <MessageSquareWarning className="h-4 w-4" /> {t("approval.requestChanges")}
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
      <AttachmentViewer items={viewable} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
    </Card>
  );
}

/** Dashboard banner for clients: "N drafts are waiting for your approval". */
export function PendingApprovalsBanner() {
  const t = useT();
  const user = useUser();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (user.role !== "client") return;
    let alive = true;
    fetch("/api/approvals?status=pending")
      .then((r) => (r.ok ? r.json() : { approvals: [] }))
      .then((d: { approvals?: unknown[] }) => alive && setN(d.approvals?.length ?? 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.role]);
  if (!n) return null;
  return (
    <Link href="/approvals" className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 transition-colors hover:bg-warning/15">
      <ShieldCheck className="h-5 w-5 shrink-0 text-warning" />
      <span className="flex-1 text-sm font-medium text-foreground">{t("approval.banner", { n })}</span>
      <ArrowRight className="h-4 w-4 text-muted" />
    </Link>
  );
}
