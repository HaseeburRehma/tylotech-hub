"use client";

/**
 * Chat extras: emoji picker, reactions, the per-message action bar, read
 * receipts ("Gesehen") and on-demand translation. Kept apart from
 * chat-thread.tsx so the thread component stays readable.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Languages, Loader2, MessageCircle, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { APP_TZ, cn } from "@/lib/utils";

// ── Emoji ───────────────────────────────────────────────────────────────────
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏", "👀", "✅"];

const EMOJI_GROUPS: { key: string; emojis: string[] }[] = [
  { key: "smileys", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😎", "🤓", "🤔", "🤨", "😐", "😏", "😌", "😴", "🥳", "😮", "😯", "😲", "🥺", "😢", "😭", "😤", "😡", "🤯", "😳", "🤗", "🤝", "🙈"] },
  { key: "gestures", emojis: ["👍", "👎", "👏", "🙌", "🙏", "💪", "👌", "✌️", "🤞", "👋", "🤙", "👀", "🫶", "☝️", "👉", "✍️"] },
  { key: "symbols", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "✅", "❌", "⚠️", "❗", "❓", "💯", "🔥", "✨", "⭐", "🎉", "🎊", "🚀", "📈", "📉", "💡", "📌", "📎", "📅", "⏰", "💰", "🏆", "🎯", "🛠️", "📣", "☕"] },
];

/** Small emoji grid in a popover. `onPick` receives the emoji; closes on outside click / Esc. */
export function EmojiPicker({
  open,
  onClose,
  onPick,
  className,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          role="dialog"
          aria-label={t("chat.emoji")}
          className={cn("absolute z-40 w-[296px] rounded-xl border border-border bg-surface p-2 shadow-float", className)}
        >
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {EMOJI_GROUPS.map((g) => (
              <div key={g.key}>
                <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">{t(`chat.emoji.${g.key}`)}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => onPick(e)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-surface-2"
                      aria-label={e}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Reactions ───────────────────────────────────────────────────────────────
export interface Reaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

/** Loads reactions for the given messages, keeps them live, and toggles optimistically. */
export function useReactions(messageIds: string[], currentUserId: string) {
  const [byMessage, setByMessage] = useState<Record<string, Reaction[]>>({});
  const idsKey = messageIds.filter((id) => !id.startsWith("temp-")).sort().join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const sb = createClient();
    if (!sb || !ids.length) return;
    let alive = true;
    (async () => {
      const rows: Reaction[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await sb.from("reactions").select("message_id,user_id,emoji").in("message_id", ids.slice(i, i + 200));
        rows.push(...((data ?? []) as Reaction[]));
      }
      if (!alive) return;
      const next: Record<string, Reaction[]> = {};
      for (const r of rows) (next[r.message_id] ??= []).push(r);
      setByMessage(next);
    })();
    const idSet = new Set(ids);
    const channel = sb
      .channel(`reactions-${ids.length}-${ids[0]}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Partial<Reaction> & { id?: string };
        if (!row.message_id || !idSet.has(row.message_id)) return;
        setByMessage((prev) => {
          const list = (prev[row.message_id!] ?? []).filter(
            (r) => !(r.user_id === row.user_id && r.emoji === row.emoji),
          );
          if (payload.eventType !== "DELETE") list.push(row as Reaction);
          return { ...prev, [row.message_id!]: list };
        });
      })
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(channel);
    };
  }, [idsKey]);

  const toggle = useCallback(
    async (messageId: string, emoji: string) => {
      const had = (byMessage[messageId] ?? []).some((r) => r.user_id === currentUserId && r.emoji === emoji);
      const apply = (add: boolean) =>
        setByMessage((prev) => {
          const list = (prev[messageId] ?? []).filter((r) => !(r.user_id === currentUserId && r.emoji === emoji));
          if (add) list.push({ message_id: messageId, user_id: currentUserId, emoji });
          return { ...prev, [messageId]: list };
        });
      apply(!had);
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      }).catch(() => null);
      if (!res?.ok) apply(had); // roll back
    },
    [byMessage, currentUserId],
  );

  return { byMessage, toggle };
}

/** Grouped reaction chips under a message; your own reactions are highlighted. */
export function ReactionChips({
  reactions,
  currentUserId,
  nameOf,
  onToggle,
}: {
  reactions: Reaction[];
  currentUserId: string;
  nameOf: (userId: string) => string;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  const groups = new Map<string, string[]>();
  for (const r of reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.user_id]);
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {Array.from(groups.entries()).map(([emoji, users]) => {
        const mine = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            title={users.map(nameOf).join(", ")}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors",
              mine ? "border-brand/50 bg-brand/10 text-foreground" : "border-border bg-surface-2/60 text-muted hover:text-foreground",
            )}
          >
            <span className="text-[13px] leading-none">{emoji}</span>
            <span className="tabular-nums">{users.length}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Action bar (shown under a message on hover / focus) ─────────────────────
export function MessageActions({
  visible,
  canEdit,
  canDelete,
  canTranslate,
  translating,
  onReact,
  onReply,
  onThread,
  onTranslate,
  onEdit,
  onDelete,
  className,
}: {
  className?: string;
  visible: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canTranslate: boolean;
  translating: boolean;
  onReact: (emoji: string) => void;
  /** Quote this message in the composer (WhatsApp-style reply). */
  onReply?: () => void;
  onThread?: () => void;
  onTranslate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [picker, setPicker] = useState(false);
  const btn = "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground";
  return (
    <div className={cn("flex h-7 items-center gap-0.5 transition-opacity", visible || picker ? "opacity-100" : "pointer-events-none opacity-0", className)}>
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 shadow-sm">
        {QUICK_REACTIONS.slice(0, 3).map((e) => (
          <button key={e} type="button" onClick={() => onReact(e)} aria-label={`${t("chat.react")} ${e}`} className={cn(btn, "text-sm")}>
            {e}
          </button>
        ))}
        <button type="button" onClick={() => setPicker((p) => !p)} aria-label={t("chat.react")} title={t("chat.react")} className={btn}>
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {onReply && (
          <button
            type="button"
            onClick={onReply}
            aria-label={t("chat.reply")}
            title={t("chat.doubleClickReply")}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Reply className="h-3.5 w-3.5" />
            {t("chat.reply")}
          </button>
        )}
        {onThread && (
          <button type="button" onClick={onThread} aria-label={t("chat.replyInThread")} title={t("chat.replyInThread")} className={btn}>
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
        )}
        {canTranslate && (
          <button type="button" onClick={onTranslate} disabled={translating} aria-label={t("chat.translateMsg")} title={t("chat.translateMsg")} className={btn}>
            {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={onEdit} aria-label={t("chat.edit")} title={t("chat.edit")} className={btn}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button type="button" onClick={onDelete} aria-label={t("chat.delete")} title={t("chat.delete")} className={cn(btn, "hover:text-danger")}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <EmojiPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(e) => {
          setPicker(false);
          onReact(e);
        }}
        className="left-0 top-9"
      />
    </div>
  );
}

// ── Translation (stored + on demand) ───────────────────────────────────────
/** On-demand translations of other people's messages into the UI language. */
const AUTO_KEY = "tylohq.chat.autoTranslate";

/**
 * Translations of other people's messages into the UI language: a remembered
 * per-person switch ("auto": show the conversation translated) plus single and
 * batch translation through /api/translate (Google, see lib/ai/translate.ts).
 */
export function useOnDemandTranslation() {
  const { locale } = useI18n();
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  // Already in the reader's language — never ask again.
  const [same, setSame] = useState<Record<string, boolean>>({});
  const [auto, setAutoState] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(AUTO_KEY);
      if (v === "0") setAutoState(false);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const apply = useCallback((id: string, text: string, translation: string | null | undefined) => {
    if (translation == null) setFailed((f) => ({ ...f, [id]: true }));
    else if (translation.trim() === text.trim()) setSame((m) => ({ ...m, [id]: true }));
    else setDone((d) => ({ ...d, [id]: translation }));
  }, []);

  const translate = useCallback(
    async (id: string, text: string) => {
      setBusy((b) => ({ ...b, [id]: true }));
      setFailed((f) => ({ ...f, [id]: false }));
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target: locale }),
      }).catch(() => null);
      const data = (res ? await res.json().catch(() => ({})) : {}) as { translation?: string };
      setBusy((b) => ({ ...b, [id]: false }));
      apply(id, text, res?.ok ? data.translation : null);
    },
    [locale, apply],
  );

  /** Translate many messages, 25 per request (one rate-limit hit each). */
  const translateMany = useCallback(
    async (items: { id: string; text: string }[]) => {
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        setBusy((b) => ({ ...b, ...Object.fromEntries(chunk.map((x) => [x.id, true])) }));
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: chunk.map((x) => x.text), target: locale }),
        }).catch(() => null);
        const data = (res ? await res.json().catch(() => ({})) : {}) as { translations?: (string | null)[] };
        setBusy((b) => ({ ...b, ...Object.fromEntries(chunk.map((x) => [x.id, false])) }));
        chunk.forEach((x, k) => apply(x.id, x.text, res?.ok ? data.translations?.[k] : null));
        if (!res?.ok) break; // rate-limited or down: stop, the switch can retry later
      }
    },
    [locale, apply],
  );

  return { locale, done, busy, failed, same, auto, setAuto, translate, translateMany };
}

// ── Read receipts ("Gesehen") ──────────────────────────────────────────────
export interface ChatRead {
  user_id: string;
  conv_key: string;
  last_read_at: string;
}

/** Conversation key shared by everyone in it (client group, team group or a DM). */
export function convKeyOf(opts: { clientId: string | null; internal: boolean; selected: string; currentUserId: string; group: string }) {
  if (opts.selected !== opts.group) return `dm:${[opts.currentUserId, opts.selected].sort().join(":")}`;
  return opts.internal || !opts.clientId ? "team" : `c:${opts.clientId}`;
}

/**
 * Marks the open conversation as read (while the tab is visible) and returns
 * everyone else's last-read time. Silently does nothing until the chat_reads
 * table exists (migration 0039).
 */
export function useChatReads(convKey: string, clientId: string | null, currentUserId: string, latestAt: string | null) {
  const [reads, setReads] = useState<ChatRead[]>([]);
  const available = useRef(true);

  const markRead = useCallback(async () => {
    const sb = createClient();
    if (!sb || !available.current || document.visibilityState !== "visible") return;
    const { error } = await sb
      .from("chat_reads")
      .upsert({ user_id: currentUserId, conv_key: convKey, client_id: clientId, last_read_at: new Date().toISOString() }, { onConflict: "user_id,conv_key" });
    if (error && /chat_reads|schema cache|does not exist/i.test(error.message)) available.current = false;
  }, [convKey, clientId, currentUserId]);

  // Load + live updates for this conversation.
  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    let alive = true;
    sb.from("chat_reads")
      .select("user_id,conv_key,last_read_at")
      .eq("conv_key", convKey)
      .then(({ data, error }) => {
        if (error) {
          if (/chat_reads|schema cache|does not exist/i.test(error.message)) available.current = false;
          return;
        }
        if (alive) setReads((data ?? []) as ChatRead[]);
      });
    const channel = sb
      .channel(`reads-${convKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads", filter: `conv_key=eq.${convKey}` }, (payload) => {
        const row = payload.new as ChatRead;
        if (!row?.user_id) return;
        setReads((prev) => [...prev.filter((r) => r.user_id !== row.user_id), row]);
      })
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(channel);
    };
  }, [convKey]);

  // Mark read on open, on every new message while open, and when the tab regains focus.
  useEffect(() => {
    void markRead();
  }, [markRead, latestAt]);
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void markRead();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  return reads.filter((r) => r.user_id !== currentUserId);
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" });

/** "Gesehen 20:21" (DM) or "Gesehen von Anna, Ben +2" (group) under your latest message. */
export function SeenLine({
  messageAt,
  reads,
  nameOf,
  isDm,
}: {
  messageAt: string;
  reads: ChatRead[];
  nameOf: (userId: string) => string;
  isDm: boolean;
}) {
  const { t } = useI18n();
  const seenBy = reads.filter((r) => r.last_read_at >= messageAt).sort((a, b) => a.last_read_at.localeCompare(b.last_read_at));
  if (!seenBy.length) return null;
  const title = seenBy.map((r) => `${nameOf(r.user_id)} · ${hhmm(r.last_read_at)}`).join("\n");
  const label = isDm
    ? t("chat.seenAt", { time: hhmm(seenBy[0]!.last_read_at) })
    : t("chat.seenBy", {
        names: seenBy.slice(0, 2).map((r) => nameOf(r.user_id)).join(", ") + (seenBy.length > 2 ? ` +${seenBy.length - 2}` : ""),
      });
  return (
    <p className="mt-1 text-right text-[11px] text-muted" title={title}>
      ✓✓ {label}
    </p>
  );
}
