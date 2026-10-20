"use client";

import { ChevronDown, Loader2, Mic, Pencil, Pin, PinOff, Plus, Send, Trash2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";

/* ────────────────────────────── Voice messages ─────────────────────────── */

const MAX_VOICE_SECONDS = 5 * 60;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Mic button → records in the browser (MediaRecorder) with a live timer;
 * stop sends it as an audio attachment, the bin discards it. Max 5 minutes.
 */
export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (file: File) => void; disabled?: boolean }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "recording" | "error">("idle");
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const discard = useRef(false);
  const started = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    rec.current?.stream.getTracks().forEach((tr) => tr.stop());
    rec.current = null;
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  async function start() {
    setError(null);
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setError(t("chat.voice.unsupported"));
      setState("error");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError(t("chat.voice.denied"));
      setState("error");
      return;
    }
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
    chunks.current = [];
    discard.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const type = (r.mimeType || mime || "audio/webm").split(";")[0]!;
      const blob = new Blob(chunks.current, { type });
      const long = (Date.now() - started.current) / 1000;
      cleanup();
      setState("idle");
      setSecs(0);
      if (discard.current || blob.size < 1200 || long < 0.8) return;
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16).replace(/[-: ]/g, "");
      onRecorded(new File([blob], `Sprachnachricht-${stamp}.${ext}`, { type }));
    };
    rec.current = r;
    started.current = Date.now();
    r.start(250);
    setState("recording");
    setSecs(0);
    tick.current = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSecs(s);
      if (s >= MAX_VOICE_SECONDS) r.state === "recording" && r.stop();
    }, 200);
  }

  const stop = (send: boolean) => {
    discard.current = !send;
    if (rec.current?.state === "recording") rec.current.stop();
    else cleanup();
  };

  if (state === "recording") {
    return (
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 rounded-2xl border border-danger/40 bg-bg px-3 py-2.5" role="status" aria-live="polite">
        <button type="button" onClick={() => stop(false)} aria-label={t("chat.voice.cancel")} title={t("chat.voice.cancel")} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
        </span>
        <span className="font-mono text-sm tabular-nums text-foreground">{mmss(secs)}</span>
        <span className="flex-1 truncate text-xs text-muted">{t("chat.voice.recording", { max: mmss(MAX_VOICE_SECONDS) })}</span>
        <button type="button" onClick={() => stop(true)} aria-label={t("chat.voice.send")} title={t("chat.voice.send")} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-brand-foreground hover:opacity-90">
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label={t("chat.voice.record")}
        title={error ?? t("chat.voice.record")}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40",
          state === "error" ? "text-danger" : "text-muted",
        )}
      >
        <Mic className="h-4 w-4" />
      </button>
      {state === "error" && error && <span className="sr-only" role="alert">{error}</span>}
    </>
  );
}

/* ─────────────────────────────── Pinned bar ────────────────────────────── */

/**
 * WhatsApp-style bar above the messages: the latest pin; tapping it jumps to
 * the message and steps to the next pin; the chevron lists all; × unpins.
 */
export function PinnedBar({
  pinned,
  snippetOf,
  onJump,
  onUnpin,
}: {
  pinned: Message[];
  snippetOf: (m: Message) => string;
  onJump: (id: string) => void;
  onUnpin: (m: Message) => void;
}) {
  const t = useT();
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => [...pinned].sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "")), [pinned]);
  useEffect(() => setIdx((i) => (i >= list.length ? 0 : i)), [list.length]);
  if (!list.length) return null;
  const cur = list[idx] ?? list[0]!;
  return (
    <div className="relative shrink-0 border-b border-border bg-surface/60 px-5 py-2">
      <div className="flex items-center gap-2">
        <Pin className="h-3.5 w-3.5 shrink-0 text-brand" />
        <button
          type="button"
          onClick={() => {
            onJump(cur.id);
            setIdx((i) => (i + 1) % list.length);
          }}
          className="min-w-0 flex-1 text-left"
          title={t("chat.pin.jump")}
        >
          <span className="block text-[11px] font-semibold text-brand">
            {t("chat.pin.title")}
            {list.length > 1 ? ` · ${idx + 1}/${list.length}` : ""}
          </span>
          <span className="block truncate text-xs text-foreground">{snippetOf(cur)}</span>
        </button>
        {list.length > 1 && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("chat.pin.all")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
        <button type="button" onClick={() => onUnpin(cur)} aria-label={t("chat.pin.unpin")} title={t("chat.pin.unpin")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
          <PinOff className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <ul className="absolute inset-x-3 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-float">
          {list.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <button
                type="button"
                onClick={() => {
                  onJump(m.id);
                  setOpen(false);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block text-[11px] text-muted">{m.sender_name}</span>
                <span className="block truncate text-xs text-foreground">{snippetOf(m)}</span>
              </button>
              <button type="button" onClick={() => onUnpin(m)} aria-label={t("chat.pin.unpin")} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function setPinned(id: string, pinned: boolean): Promise<string | null> {
  const res = await fetch("/api/messages/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, pinned }),
  }).catch(() => null);
  if (res?.ok) return null;
  const d = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
  return d.error ?? "Failed";
}

/* ───────────────────────────── Quick replies ───────────────────────────── */

export interface QuickReply {
  id: string;
  shortcut: string;
  body: string;
}

/** The team's shared quick replies (migration 0042), loaded once per chat. */
export function useQuickReplies(enabled: boolean) {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [ready, setReady] = useState(true);
  const load = useCallback(async () => {
    if (!enabled) return;
    const sb = createClient();
    if (!sb) return;
    const { data, error } = await sb.from("quick_replies").select("id,shortcut,body").order("shortcut");
    if (error) {
      if (/quick_replies|schema cache|does not exist/i.test(error.message)) setReady(false);
      return;
    }
    setItems((data ?? []) as QuickReply[]);
  }, [enabled]);
  useEffect(() => void load(), [load]);
  return { items, ready, reload: load };
}

/** {company}, {name}, {me} → filled in from the conversation. */
export function fillQuickReply(body: string, vars: { company?: string; name?: string; me?: string }) {
  return body
    .replace(/\{company\}|\{firma\}/gi, vars.company ?? "")
    // No name known → drop the placeholder and the space before it ("Hallo {name}," → "Hallo,").
    .replace(/\s*\{name\}/gi, (m) => (vars.name ? m.replace(/\{name\}/i, vars.name) : ""))
    .replace(/\{me\}|\{ich\}/gi, vars.me ?? "");
}

/** Popup over the composer while the draft starts with "/": ↑↓ pick, Enter/Tab insert, Esc close. */
export function QuickReplyPopup({
  items,
  query,
  active,
  onPick,
  onHover,
  onManage,
}: {
  items: QuickReply[];
  query: string;
  active: number;
  onPick: (r: QuickReply) => void;
  onHover: (i: number) => void;
  onManage: () => void;
}) {
  const t = useT();
  return (
    <div className="absolute bottom-full left-5 right-5 z-40 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-float" role="listbox" aria-label={t("chat.qr.title")}>
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <Zap className="h-3 w-3" /> {t("chat.qr.title")}
        </span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onManage} className="text-[11px] font-medium text-brand hover:underline">
          {t("chat.qr.manage")}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-muted">{query ? t("chat.qr.noMatch", { q: query }) : t("chat.qr.empty")}</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto pb-1">
          {items.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(r)}
                className={cn("flex w-full items-start gap-3 px-3 py-2 text-left", i === active ? "bg-brand/10" : "hover:bg-surface-2")}
              >
                <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-brand">/{r.shortcut}</span>
                <span className="line-clamp-2 min-w-0 flex-1 text-xs text-foreground">{r.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Add / edit / delete the team's quick replies. */
export function QuickRepliesModal({ open, onClose, items, onChanged, ready }: { open: boolean; onClose: () => void; items: QuickReply[]; onChanged: () => void; ready: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setShortcut("");
    setBody("");
    setError(null);
  }, [open]);

  const valid = /^[a-z0-9][a-z0-9_-]{0,29}$/.test(shortcut) && body.trim().length > 0;

  async function save() {
    const sb = createClient();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const row = { shortcut, body: body.trim().slice(0, 4000), updated_at: new Date().toISOString() };
    const { data: auth } = await sb.auth.getUser();
    const { error: err } = editing
      ? await sb.from("quick_replies").update(row).eq("id", editing.id)
      : await sb.from("quick_replies").insert({ ...row, created_by: auth.user?.id ?? null });
    setBusy(false);
    if (err) return setError(/duplicate|unique/i.test(err.message) ? t("chat.qr.taken", { s: shortcut }) : err.message);
    setEditing(null);
    setShortcut("");
    setBody("");
    onChanged();
  }

  async function remove(r: QuickReply) {
    const sb = createClient();
    if (!sb) return;
    setBusy(true);
    const { error: err } = await sb.from("quick_replies").delete().eq("id", r.id);
    setBusy(false);
    if (err) return setError(err.message);
    if (editing?.id === r.id) {
      setEditing(null);
      setShortcut("");
      setBody("");
    }
    onChanged();
  }

  return (
    <ModalShell open={open} onClose={onClose} className="max-w-xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Zap className="h-4 w-4 text-brand" /> {t("chat.qr.title")}
        </h2>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        {!ready ? (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{t("chat.qr.needsMigration")}</p>
        ) : (
          <>
            <p className="text-xs text-muted">{t("chat.qr.help")}</p>
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted">/</span>
                <input
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30))}
                  placeholder={t("chat.qr.shortcutPh")}
                  aria-label={t("chat.qr.shortcut")}
                  className="input-base h-9 py-0 font-mono text-sm"
                />
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                placeholder={t("chat.qr.bodyPh")}
                aria-label={t("chat.qr.body")}
                className="input-base min-h-[90px] text-sm"
              />
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setShortcut("");
                      setBody("");
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground"
                  >
                    {t("common.cancel")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!valid || busy}
                  onClick={save}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {editing ? t("common.save") : t("chat.qr.add")}
                </button>
              </div>
            </div>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {items.map((r) => (
                <li key={r.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-brand">/{r.shortcut}</span>
                  <span className="line-clamp-3 min-w-0 flex-1 whitespace-pre-line text-xs text-foreground">{r.body}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(r);
                      setShortcut(r.shortcut);
                      setBody(r.body);
                    }}
                    aria-label={t("chat.edit")}
                    className="text-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(r)} disabled={busy} aria-label={t("chat.delete")} className="text-muted hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="py-3 text-center text-xs text-muted">{t("chat.qr.empty")}</li>}
            </ul>
          </>
        )}
      </div>
    </ModalShell>
  );
}
