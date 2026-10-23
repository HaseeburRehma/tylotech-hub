"use client";

import { CalendarClock, Check, Copy, Loader2, Mail, MessageCircle, Phone, PhoneCall, Send, StickyNote, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { LEAD_STATUSES, dialable, prettyLabel, type Lead, type LeadActivity, type LeadPerson, type LeadStatus } from "@/lib/leads-shared";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { STATUS_VARIANT, SourceBadge, fmtDateTime } from "./lead-bits";

/** datetime-local value in Berlin time ↔ ISO. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return p.replace(" ", "T");
};
const fromLocalInput = (v: string) => {
  if (!v) return null;
  // Interpret as Berlin wall time: find the offset for that moment.
  const guess = new Date(`${v}:00Z`);
  const berlin = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (berlin.getTime() - utc.getTime())).toISOString();
};

const PILL: Record<string, string> = {
  info: "border-info/50 bg-info/15 text-info",
  neutral: "border-border bg-surface-2 text-foreground",
  warning: "border-warning/50 bg-warning/15 text-warning",
  brand: "border-brand/50 bg-brand/15 text-brand-ink",
  success: "border-success/50 bg-success/15 text-success",
  danger: "border-danger/50 bg-danger/15 text-danger",
  outline: "border-border bg-transparent text-muted",
};

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: !!res?.ok, data, error: (data.error as string | undefined) ?? null };
}

export function LeadDrawer({
  lead,
  people,
  staff,
  onClose,
  onChange,
  onDeleted,
}: {
  lead: Lead;
  people: LeadPerson[];
  staff: boolean;
  onClose: () => void;
  onChange: (l: Lead) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [appt, setAppt] = useState(toLocalInput(lead.appointment_at));
  const [value, setValue] = useState(lead.value != null ? String(lead.value) : "");
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? "—" : t("leads.system"));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setAppt(toLocalInput(lead.appointment_at));
    setValue(lead.value != null ? String(lead.value) : "");
  }, [lead.id, lead.appointment_at, lead.value]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Timeline (RLS: the team and the partner's own people) — live.
  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    let alive = true;
    sb.from("lead_activities")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => alive && setActivities((data ?? []) as LeadActivity[]));
    const ch = sb
      .channel(`lead-act:${lead.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_activities", filter: `lead_id=eq.${lead.id}` }, (p) =>
        setActivities((a) => (a.some((x) => x.id === (p.new as LeadActivity).id) ? a : [p.new as LeadActivity, ...a])),
      )
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, [lead.id]);

  async function patch(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    const r = await call(`/api/leads/${lead.id}`, "PATCH", body);
    setBusy(null);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    if (r.data.lead) onChange(r.data.lead as Lead);
  }

  async function log(kind: "note" | "call" | "email", body: string) {
    setBusy(kind);
    setError(null);
    const r = await call(`/api/leads/${lead.id}/notes`, "POST", { kind, body });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    if (kind === "note") setNote("");
    if (kind !== "note" && lead.status === "new") onChange({ ...lead, status: "contacted" });
  }

  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    const r = await call(`/api/leads/${lead.id}`, "DELETE");
    setBusy(null);
    if (!r.ok) return setError(r.error ?? t("ait.actionFailed"));
    onDeleted(lead.id);
  }

  const activityText = (a: LeadActivity) => {
    const m = (a.meta ?? {}) as Record<string, string | number | null>;
    switch (a.kind) {
      case "created":
        return t("leads.act.created");
      case "status":
        return t("leads.act.status", { to: t(`leads.status.${m.to}`) });
      case "assign":
        return m.to ? t("leads.act.assign", { name: nameOf(String(m.to)) }) : t("leads.act.unassign");
      case "appointment":
        return m.at ? t("leads.act.appointment", { when: fmtDateTime(String(m.at)) }) : t("leads.act.appointmentRemoved");
      case "value":
        return t("leads.act.value", { value: m.value != null ? Number(m.value).toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : "—" });
      case "call":
        return t("leads.act.call");
      case "email":
        return t("leads.act.email");
      case "edit":
        return t("leads.act.edit");
      default:
        return t("leads.act.note");
    }
  };

  if (!mounted) return null;
  const phone = lead.phone;
  const panel = (
    <AnimatePresence>
      <motion.div key="bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] bg-foreground/25 backdrop-blur-sm" />
      <motion.aside
        key="panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Lead #${lead.lead_no}`}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-xl flex-col border-l border-border bg-bg shadow-float"
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs text-muted">
              <span className="font-mono">#{lead.lead_no}</span>
              <SourceBadge lead={lead} />
              <span>{fmtDateTime(lead.created_at)}</span>
              {lead.is_test && <span className="rounded bg-warning/15 px-1 text-[10px] font-semibold text-warning">TEST</span>}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{lead.name ?? lead.email ?? lead.phone ?? t("leads.noName")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Contact + quick actions (each logs to the timeline) */}
          <div className="space-y-2">
            {phone && (
              <div className="flex flex-wrap items-center gap-2">
                <a href={`tel:${dialable(phone)}`} onClick={() => void log("call", "")} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90">
                  <Phone className="h-4 w-4" /> {phone}
                </a>
                <a
                  href={`https://wa.me/${dialable(phone, true)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void log("call", "WhatsApp")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
                >
                  <MessageCircle className="h-4 w-4 text-success" /> WhatsApp
                </a>
                <button type="button" onClick={() => copy(phone)} aria-label={t("chat.copy")} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground">
                  {copied === phone ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
            {lead.email && (
              <div className="flex flex-wrap items-center gap-2">
                <a href={`mailto:${lead.email}`} onClick={() => void log("email", "")} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                  <Mail className="h-4 w-4 text-brand-ink" /> {lead.email}
                </a>
                <button type="button" onClick={() => copy(lead.email!)} aria-label={t("chat.copy")} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-foreground">
                  {copied === lead.email ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            )}
            {phone && (
              <button
                type="button"
                disabled={!!busy}
                onClick={async () => {
                  await log("call", t("leads.notReachedNote"));
                  await patch({ status: "not_reached" }, "status");
                }}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
              >
                <PhoneCall className="h-3.5 w-3.5" /> {t("leads.markNotReached")}
              </button>
            )}
          </div>

          {/* Status pipeline */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("leads.statusLabel")}</p>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map((s: LeadStatus) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy === "status"}
                  onClick={() => s !== lead.status && patch({ status: s }, "status")}
                  aria-pressed={s === lead.status}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    s === lead.status ? PILL[STATUS_VARIANT[s]] : "border-border text-muted hover:border-brand/40 hover:text-foreground",
                  )}
                >
                  {s === lead.status && <Check className="mr-1 inline h-3 w-3" />}
                  {t(`leads.status.${s}`)}
                </button>
              ))}
            </div>
            {lead.status === "lost" && (
              <input
                defaultValue={lead.lost_reason ?? ""}
                onBlur={(e) => e.target.value !== (lead.lost_reason ?? "") && patch({ lostReason: e.target.value }, "lost")}
                placeholder={t("leads.lostReasonPh")}
                className="input-base mt-2 h-9 py-0 text-sm"
                aria-label={t("leads.lostReasonPh")}
              />
            )}
          </section>

          {/* Owner, appointment, value */}
          <section className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{t("leads.owner")}</span>
              <select value={lead.assigned_to ?? ""} onChange={(e) => patch({ assignedTo: e.target.value || null }, "owner")} className="input-base h-10 appearance-none py-0 text-sm">
                <option value="">{t("leads.unassigned")}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.role !== "client" ? " · TyloTech" : p.title ? ` · ${p.title}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                <CalendarClock className="h-3 w-3" /> {t("leads.appointment")}
              </span>
              <input
                type="datetime-local"
                value={appt}
                onChange={(e) => setAppt(e.target.value)}
                onBlur={() => appt !== toLocalInput(lead.appointment_at) && patch({ appointmentAt: fromLocalInput(appt) }, "appt")}
                className="input-base h-10 py-0 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{t("leads.value")}</span>
              <input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => value !== (lead.value != null ? String(lead.value) : "") && patch({ value: value === "" ? null : Number(value) }, "value")}
                placeholder="€"
                className="input-base h-10 py-0 text-sm"
              />
            </label>
          </section>
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          {/* Every answer from the form */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("leads.answers")}</p>
            {lead.fields.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <dl className="divide-y divide-border rounded-xl border border-border">
                {lead.fields.map((f, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2">
                    <dt className="text-xs text-muted">{prettyLabel(f.label)}</dt>
                    <dd className="whitespace-pre-line break-words text-sm text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* Where it came from */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("leads.origin")}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {[
                [t("leads.f.campaign"), lead.campaign],
                [t("leads.f.adGroup"), lead.ad_group],
                [t("leads.f.ad"), lead.ad],
                [t("leads.f.form"), lead.form],
                [t("leads.f.platform"), lead.platform],
                [t("leads.f.received"), fmtDateTime(lead.received_at)],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={String(k)} className="contents">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="break-words text-foreground">{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {/* Timeline */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("leads.timeline")}</p>
            <div className="mb-3 space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder={t("leads.notePh")} className="min-h-[70px] text-sm" />
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" disabled={!note.trim() || busy === "note"} onClick={() => log("note", note.trim())}>
                  {busy === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("leads.addNote")}
                </Button>
              </div>
            </div>
            <ol className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-2.5">
                  {a.user_id ? <Avatar name={nameOf(a.user_id)} size={24} /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2"><StickyNote className="h-3 w-3 text-muted" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">
                      <span className="font-medium text-foreground">{a.user_id ? nameOf(a.user_id) : t("leads.system")}</span> · {activityText(a)} · {fmtDateTime(a.created_at)}
                    </p>
                    {a.body && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground">{a.body}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {staff && (
            <div className="border-t border-border pt-4">
              <Button size="sm" variant={confirmDelete ? "danger" : "ghost"} disabled={busy === "delete"} onClick={remove} onBlur={() => setConfirmDelete(false)}>
                <Trash2 className="h-4 w-4" /> {confirmDelete ? t("leads.confirmDelete") : t("leads.delete")}
              </Button>
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
  return createPortal(panel, document.body);
}
