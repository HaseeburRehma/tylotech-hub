"use client";

import { AlertTriangle, Check, CheckCircle2, Copy, Globe, Loader2, Plus, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import type { LeadSourceView } from "@/lib/leads-shared";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "./lead-bits";

async function post(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: !!res?.ok, data, error: (data.error as string | undefined) ?? null };
}

function Header({ title, onClose, icon }: { title: string; onClose: () => void; icon: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <h2 className="flex items-center gap-2 font-semibold text-foreground">
        {icon} {title}
      </h2>
      <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ───────────────────────────── Add a lead ─────────────────────────────── */

export function AddLeadModal({ clientId, onClose, onCreated }: { clientId: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [f, setF] = useState({ name: "", phone: "", email: "", campaign: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    setError(null);
    const r = await post("/api/leads", { ...f, clientId: clientId ?? undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    onCreated(String(r.data.id));
  }
  return (
    <ModalShell open onClose={onClose}>
      <Header title={t("leads.add")} onClose={onClose} icon={<Plus className="h-4 w-4 text-brand" />} />
      <div className="space-y-3 p-5">
        <div>
          <Label htmlFor="ld-name">{t("leads.f.name")}</Label>
          <input id="ld-name" value={f.name} onChange={set("name")} maxLength={200} className="input-base h-10 py-0 text-sm" autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ld-phone">{t("leads.f.phone")}</Label>
            <input id="ld-phone" type="tel" value={f.phone} onChange={set("phone")} maxLength={60} className="input-base h-10 py-0 text-sm" />
          </div>
          <div>
            <Label htmlFor="ld-email">{t("leads.f.email")}</Label>
            <input id="ld-email" type="email" value={f.email} onChange={set("email")} maxLength={320} className="input-base h-10 py-0 text-sm" />
          </div>
        </div>
        <div>
          <Label htmlFor="ld-camp">{t("leads.f.campaignOptional")}</Label>
          <input id="ld-camp" value={f.campaign} onChange={set("campaign")} maxLength={300} placeholder={t("leads.f.campaignPh")} className="input-base h-10 py-0 text-sm" />
        </div>
        <div>
          <Label htmlFor="ld-note">{t("leads.f.note")}</Label>
          <Textarea id="ld-note" value={f.note} onChange={set("note")} maxLength={4000} className="min-h-[70px] text-sm" />
        </div>
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={busy} disabled={!f.name.trim() && !f.phone.trim() && !f.email.trim()} onClick={save}>
            {t("leads.save")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─────────────────────────── Invite sales people ──────────────────────── */

export function InviteSalesModal({ clientId, company, onClose }: { clientId: string | null; company: string; onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState([{ name: "", email: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; status: string; emailed?: boolean }[] | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    const r = await post("/api/invites", {
      clientId: clientId ?? undefined,
      invites: rows.filter((x) => x.email.trim()).map((x) => ({ ...x, title: "Vertrieb" })),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    setResult((r.data.results as typeof result) ?? []);
  }
  return (
    <ModalShell open onClose={onClose}>
      <Header title={t("leads.inviteTitle", { company })} onClose={onClose} icon={<UserPlus className="h-4 w-4 text-brand" />} />
      <div className="space-y-3 p-5">
        {result ? (
          <>
            <ul className="space-y-1.5">
              {result.map((r) => (
                <li key={r.email} className="flex items-center gap-2 text-sm">
                  {r.status === "invited" ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                  <span className="flex-1 truncate">{r.email}</span>
                  <span className="text-xs text-muted">{t(`leads.invite.${r.status === "invited" ? (r.emailed === false ? "noMail" : "sent") : r.status === "exists" ? "exists" : "error"}`)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={onClose}>{t("common.close")}</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{t("leads.inviteHelp", { company })}</p>
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <input
                  value={r.name}
                  onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))}
                  placeholder={t("leads.f.name")}
                  aria-label={t("leads.f.name")}
                  className="input-base h-10 py-0 text-sm"
                />
                <input
                  type="email"
                  value={r.email}
                  onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))}
                  placeholder={t("leads.f.email")}
                  aria-label={t("leads.f.email")}
                  className="input-base h-10 py-0 text-sm"
                />
              </div>
            ))}
            {rows.length < 5 && (
              <button type="button" onClick={() => setRows((x) => [...x, { name: "", email: "" }])} className="text-xs font-medium text-brand hover:underline">
                + {t("leads.invite.more")}
              </button>
            )}
            {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button loading={busy} disabled={!rows.some((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim()))} onClick={send}>
                <UserPlus className="h-4 w-4" /> {t("leads.invite.send")}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

/* ───────────────────────────── Lead sources ───────────────────────────── */

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted">{label}</p>
      <div className="flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-foreground">{value}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          }}
          aria-label={label}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          {done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function SourcesModal({
  clientId,
  staff,
  sources,
  metaReady,
  webhook,
  onClose,
  onChanged,
}: {
  clientId: string;
  staff: boolean;
  sources: LeadSourceView[];
  metaReady: boolean;
  webhook: { url: string; verifyToken: string | null } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const meta = sources.filter((s) => s.kind === "meta");
  const hooks = sources.filter((s) => s.kind !== "meta");

  async function create(kind: "google_ads" | "webhook") {
    setBusy(kind);
    setError(null);
    const r = await post("/api/leads/sources", { clientId: staff ? clientId : undefined, kind });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    onChanged();
  }
  async function remove(id: string) {
    setBusy(id);
    const res = await fetch(`/api/leads/sources/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(t("ait.actionFailed"));
    onChanged();
  }
  async function sync() {
    setBusy("sync");
    setError(null);
    setInfo(null);
    const r = await post("/api/leads/meta/sync", { clientId: staff ? clientId : undefined, days: 30 });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    setInfo(t("leads.meta.synced", { n: Number(r.data.added ?? 0) }));
    onChanged();
  }

  const statusLine = (s: LeadSourceView) => (
    <p className={cn("text-[11px]", s.status === "error" ? "text-danger" : "text-muted")}>
      {s.status === "error" ? s.last_error ?? t("leads.src.error") : s.last_received_at ? t("leads.src.lastLead", { when: fmtDateTime(s.last_received_at) }) : t("leads.src.waiting")}
    </p>
  );

  return (
    <ModalShell open onClose={onClose} className="max-w-2xl">
      <Header title={t("leads.sources")} onClose={onClose} icon={<Globe className="h-4 w-4 text-brand" />} />
      <div className="space-y-6 p-5">
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {info && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{info}</p>}

        {/* Meta */}
        <section className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">Meta Lead Ads</p>
              <p className="text-xs text-muted">{t("leads.src.metaHelp")}</p>
            </div>
            <div className="flex gap-2">
              {meta.length > 0 && (
                <Button size="sm" variant="secondary" disabled={busy === "sync"} onClick={sync}>
                  {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t("leads.src.syncNow")}
                </Button>
              )}
              {metaReady ? (
                <a href={`/api/leads/meta/connect${staff ? `?clientId=${clientId}` : ""}`}>
                  <Button size="sm">{meta.length ? t("leads.src.reconnect") : t("leads.src.connectMeta")}</Button>
                </a>
              ) : (
                <span className="text-xs text-muted">{t("leads.src.metaNotConfigured")}</span>
              )}
            </div>
          </div>
          {meta.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg bg-surface-2/50 px-3 py-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", s.status === "error" ? "bg-danger" : "bg-success")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{s.label}</p>
                {statusLine(s)}
              </div>
              <button type="button" onClick={() => remove(s.id)} disabled={busy === s.id} aria-label={t("leads.src.remove")} className="text-muted hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {staff && webhook?.verifyToken && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">{t("leads.src.metaAppSetup")}</summary>
              <div className="mt-2 space-y-2">
                <p>{t("leads.src.metaAppSteps")}</p>
                <CopyField label="Callback URL" value={webhook.url} />
                <CopyField label="Verify token" value={webhook.verifyToken} />
              </div>
            </details>
          )}
        </section>

        {/* Google Ads + website webhooks */}
        <section className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">{t("leads.src.hooksTitle")}</p>
              <p className="text-xs text-muted">{t("leads.src.hooksHelp")}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={busy === "google_ads"} onClick={() => create("google_ads")}>
                <Plus className="h-4 w-4" /> Google Ads
              </Button>
              <Button size="sm" variant="secondary" disabled={busy === "webhook"} onClick={() => create("webhook")}>
                <Plus className="h-4 w-4" /> {t("leads.src.website")}
              </Button>
            </div>
          </div>
          {hooks.map((s) => (
            <div key={s.id} className="space-y-2 rounded-lg bg-surface-2/50 p-3">
              <div className="flex items-center gap-3">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", s.status === "error" ? "bg-danger" : s.last_received_at ? "bg-success" : "bg-warning")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{s.label}</p>
                  {statusLine(s)}
                </div>
                <button type="button" onClick={() => remove(s.id)} disabled={busy === s.id} aria-label={t("leads.src.remove")} className="text-muted hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {s.hookUrl && <CopyField label={t("leads.src.url")} value={s.kind === "google_ads" ? s.hookUrl : `${s.hookUrl}?key=${s.key}`} />}
              {s.kind === "google_ads" && s.key && <CopyField label={t("leads.src.key")} value={s.key} />}
              <p className="text-[11px] leading-relaxed text-muted">{s.kind === "google_ads" ? t("leads.src.googleSteps") : t("leads.src.webhookSteps")}</p>
            </div>
          ))}
        </section>
      </div>
    </ModalShell>
  );
}
