"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AtSign,
  ArrowDown,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  Smile,
  Languages,
  Pin,
} from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ComponentProps } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AttachmentViewer, type ViewerItem } from "@/components/chat/attachment-viewer";
import { PinnedBar, QuickRepliesModal, QuickReplyPopup, VoiceRecorder, fillQuickReply, setPinned, useQuickReplies, type QuickReply } from "@/components/chat/chat-tools";
import {
  EmojiPicker,
  MessageActions,
  ReactionChips,
  SeenLine,
  TypingLine,
  convKeyOf,
  copyText,
  useChatReads,
  useOnDemandTranslation,
  useReactions,
  useTyping,
} from "@/components/chat/message-extras";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ChatPeer, Message, Role } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { APP_TZ } from "@/lib/utils";

/** The conversation's client logo — shown instead of initials for client senders. */
const ClientLogoContext = createContext<string | null>(null);

function SenderAvatar({ name, role, size, className }: { name: string; role?: string | null; size: number; className?: string }) {
  const logo = useContext(ClientLogoContext);
  return role === "client" && logo ? (
    <Avatar name={name} src={logo} logo size={size} className={className} />
  ) : (
    <Avatar name={name} size={size} className={className} />
  );
}

const GROUP = "group";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("de-DE", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(iso: string, t: (k: string) => string): string {
  try {
    const d = new Date(iso);
    // Calendar days in Berlin time, so server and browser agree on "today".
    const dayKey = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: APP_TZ });
    const now = new Date();
    if (dayKey(d) === dayKey(now)) return t("chat.today");
    if (dayKey(d) === dayKey(new Date(now.getTime() - 86400000))) return t("chat.yesterday");
    return d.toLocaleDateString("de-DE", { timeZone: APP_TZ, weekday: "long", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function renderRich(text: string): string {
  const esc = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  // Links first (only http/https; already escaped, so safe inside href), parked
  // as placeholders so the bold/mention rules below can't reach into a URL.
  const links: string[] = [];
  const parked = esc.replace(/\bhttps?:\/\/[^\s<]*[^\s<.,;:!?)\]'"*]/g, (url) => `\u0000${links.push(url) - 1}\u0000`);
  return parked
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=\n]+)==/g, '<mark style="background:rgba(201,168,76,.38);color:inherit;border-radius:3px;padding:0 2px">$1</mark>')
    .replace(/@([A-Za-zÀ-ÿ][\w\s]{0,30}[\w])/g, '<span class="text-brand font-semibold">@$1</span>')
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => {
      const url = links[Number(i)]!;
      const label = url.length > 60 ? `${url.slice(0, 57)}…` : url;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="break-all underline decoration-current/40 underline-offset-2 hover:decoration-current">${label}</a>`;
    });
}

function MentionPopup({
  peers,
  query,
  onSelect,
  position,
}: {
  peers: ChatPeer[];
  query: string;
  onSelect: (p: ChatPeer) => void;
  position: { left: number; bottom: number };
}) {
  const filtered = peers.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [query]);

  if (!filtered.length) return null;
  return (
    <div
      className="absolute z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      style={{ left: position.left, bottom: position.bottom }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">People</div>
      {filtered.slice(0, 8).map((p, i) => (
        <button
          key={p.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(p); }}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
            i === idx ? "bg-brand/10 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <SenderAvatar name={p.name} role={p.role} size={24} />
          <span className="font-medium">{p.name}</span>
          <span className="ml-auto text-[10px] text-muted/60">{p.role}</span>
        </button>
      ))}
    </div>
  );
}

function ThreadPanel({
  parent,
  replies,
  currentUserId,
  currentName,
  currentRole,
  clientId,
  internal,
  onClose,
  onSend,
  peers,
  renderBody,
}: {
  /** Message text (with translation toggle) + reactions, from the main thread. */
  renderBody: (m: Message) => React.ReactNode;
  parent: Message;
  replies: Message[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
  internal: boolean;
  onClose: () => void;
  onSend: (content: string, parentId: string, mentions: string[]) => Promise<boolean>;
  peers: ChatPeer[];
}) {
  const t = useT();
  const [val, setVal] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [val]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const content = val.trim();
    if (!content || sending) return;
    setSending(true);
    setVal("");
    const mentionIds = extractMentions(content, peers);
    const ok = await onSend(content, parent.id, mentionIds);
    if (!ok) setVal(content);
    setSending(false);
  }

  const allMsgs = [parent, ...replies];

  return (
    <motion.div
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      // Full screen on phones (a 340px side panel would squeeze the messages to
      // nothing at 375px); a side panel from md up.
      className="fixed inset-0 z-50 flex flex-col bg-bg md:static md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-border"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{t("chat.thread")}</p>
          <p className="text-[11px] text-muted">{parent.sender_name} · {replies.length} {t("chat.replies")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("chat.closeThread")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {allMsgs.map((m, i) => {
          const prevSame = i > 0 && allMsgs[i - 1].sender_id === m.sender_id;
          return (
            <div key={m.id} className={cn("group relative", prevSame ? "mt-0.5" : "mt-3")}>
              {!prevSame && (
                <div className="mb-1 flex items-center gap-2">
                  <SenderAvatar name={m.sender_name} role={m.sender_role} size={24} />
                  <span className="text-[12px] font-semibold text-foreground">{m.sender_name}</span>
                  <span className="text-[10px] text-muted/60">{formatTime(m.created_at)}</span>
                </div>
              )}
              <div className={cn("pl-8 text-sm leading-relaxed text-foreground", i === 0 && "border-b border-border pb-3 mb-3")}>
                {renderBody(m)}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-border p-3">
        <div className="rounded-xl border border-border bg-bg/60 focus-within:border-brand/50">
          <div className="flex items-end gap-1.5 px-2 py-1.5">
            <textarea
              ref={composerRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
              }}
              rows={1}
              autoFocus
              placeholder={`${t("chat.reply")}…`}
              className="max-h-[160px] min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted/60"
            />
            <div className="relative mb-0.5">
              <button
                type="button"
                onClick={() => setEmojiOpen((o) => !o)}
                aria-label={t("chat.addEmoji")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Smile className="h-4 w-4" />
              </button>
              <EmojiPicker
                open={emojiOpen}
                onClose={() => setEmojiOpen(false)}
                onPick={(e) => {
                  setVal((v) => v + e);
                  composerRef.current?.focus();
                }}
                className="bottom-10 right-0"
              />
            </div>
            <Button type="submit" size="icon" aria-label={t("chat.sendReply")} disabled={!val.trim() || sending} className="mb-0.5 h-8 w-8 shrink-0 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}

function extractMentions(text: string, peers: ChatPeer[]): string[] {
  const mentions: string[] = [];
  const re = /@([A-Za-zÀ-ÿ][\w\s]{0,30}[\w])/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim().toLowerCase();
    const peer = peers.find((p) => p.name.toLowerCase() === name);
    if (peer && !mentions.includes(peer.id)) mentions.push(peer.id);
  }
  return mentions;
}

export function ChatThread({ clientLogoUrl = null, ...props }: ComponentProps<typeof ChatThreadInner> & { clientLogoUrl?: string | null }) {
  return (
    <ClientLogoContext.Provider value={clientLogoUrl}>
      <ChatThreadInner {...props} />
    </ClientLogoContext.Provider>
  );
}

function ChatThreadInner({
  initialMessages,
  currentUserId,
  currentName,
  currentRole,
  clientId,
  peers = [],
  title,
  subtitle,
  className,
  internal = false,
  initialSelected,
}: {
  initialMessages: Message[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
  peers?: ChatPeer[];
  title: string;
  subtitle?: string;
  className?: string;
  internal?: boolean;
  /** Open a specific DM (peer id) instead of the group thread. */
  initialSelected?: string | null;
}) {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selected, setSelected] = useState<string>(
    initialSelected && peers.some((p) => p.id === initialSelected) ? initialSelected : GROUP,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [translating, setTranslating] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [val, setVal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingAtt, setPendingAtt] = useState<{ id: string; file: File; url: string | null }[]>([]);
  const seen = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const [threadParentId, setThreadParentId] = useState<string | null>(null);
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState({ left: 0, bottom: 0 });
  const [sidebarTab, setSidebarTab] = useState<"channels" | "threads" | "mentions">("channels");

  const threadKeyOf = (m: Message): string => {
    if (!m.recipient_id) return GROUP;
    return m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
  };

  const visible = useMemo(
    () => messages.filter((m) => threadKeyOf(m) === selected && !m.parent_id),
    [messages, selected],
  );
  const q = searchQ.trim().toLowerCase();
  const shown = q
    ? visible.filter(
        (m) =>
          m.content?.toLowerCase().includes(q) ||
          m.content_translated?.toLowerCase().includes(q) ||
          m.attachment_name?.toLowerCase().includes(q) ||
          m.sender_name.toLowerCase().includes(q),
      )
    : visible;

  // Reactions, translations and read receipts (message-extras.tsx).
  const convMessageIds = useMemo(
    () => messages.filter((m) => threadKeyOf(m) === selected).map((m) => m.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, selected],
  );
  const { byMessage: reactionsByMsg, toggle: toggleReaction } = useReactions(convMessageIds, currentUserId);
  const tr = useOnDemandTranslation();
  // Per-message override of the conversation-wide translation switch.
  const [msgView, setMsgView] = useState<Record<string, "orig" | "tr">>({});
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of peers) map.set(p.id, p.name);
    for (const m of messages) if (!map.has(m.sender_id)) map.set(m.sender_id, m.sender_name);
    map.set(currentUserId, currentName);
    return map;
  }, [peers, messages, currentUserId, currentName]);
  const nameOf = useCallback((id: string) => nameById.get(id) ?? "—", [nameById]);
  const convKey = convKeyOf({ clientId, internal, selected, currentUserId, group: GROUP });
  const latestAt = visible.length ? visible[visible.length - 1]!.created_at : null;
  const { reads, myPrevReadAt } = useChatReads(convKey, internal ? null : clientId, currentUserId, latestAt);
  const typing = useTyping(convKey, currentUserId, currentName);
  // First message from others since you last had this conversation open.
  const firstUnreadId = useMemo(() => {
    if (!myPrevReadAt) return null;
    return visible.find((m) => m.sender_id !== currentUserId && !m.id.startsWith("temp-") && m.created_at > myPrevReadAt)?.id ?? null;
  }, [visible, myPrevReadAt, currentUserId]);
  const lastMineId = useMemo(
    () => [...visible].reverse().find((m) => m.sender_id === currentUserId && !m.id.startsWith("temp-"))?.id ?? null,
    [visible, currentUserId],
  );
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Quick replies ("/" in the composer) — staff only (migration 0042).
  const isStaffUser = currentRole !== "client";
  const qr = useQuickReplies(isStaffUser);
  const [qrIndex, setQrIndex] = useState(0);
  const [qrManage, setQrManage] = useState(false);
  const slash = isStaffUser ? /^\/([a-z0-9_-]*)$/i.exec(val) : null;
  const qrMatches = useMemo(() => {
    if (!slash) return [] as QuickReply[];
    const term = slash[1]!.toLowerCase();
    return qr.items
      .filter((r) => !term || r.shortcut.startsWith(term) || r.body.toLowerCase().includes(term))
      .sort((a, b) => Number(b.shortcut.startsWith(term)) - Number(a.shortcut.startsWith(term)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slash?.[1], qr.items]);

  /** Message text in the reader's language: stored or on-demand translation, with a toggle back to the original. */
  const renderText = (m: Message) => {
    const mineMsg = m.sender_id === currentUserId;
    const stored = !mineMsg && m.content_translated && m.translated_to === tr.locale ? m.content_translated : null;
    const translated = stored ?? (!mineMsg ? tr.done[m.id] : undefined) ?? null;
    const view = msgView[m.id];
    const original = !(view === "tr" || (view !== "orig" && tr.auto));
    const text = translated && !original ? translated : m.content;
    return (
      <>
        <span dangerouslySetInnerHTML={{ __html: renderRich(text) }} />
        {m.edited_at && <span className="ml-1 text-[10px] text-muted/40">({t("chat.edited")})</span>}
        {m.pinned_at && <Pin className="ml-1 inline h-3 w-3 -rotate-45 align-baseline text-brand" aria-label={t("chat.pin.pinned")} />}
        {translated && (
          <button
            type="button"
            onClick={() => setMsgView((v) => ({ ...v, [m.id]: original ? "tr" : "orig" }))}
            className="ml-2 whitespace-nowrap align-baseline text-[11px] text-muted transition-colors hover:text-foreground"
          >
            · {t("chat.translated")} · {original ? t("chat.showTranslation") : t("chat.showOriginal")}
          </button>
        )}
        {tr.failed[m.id] && <span className="ml-2 text-[11px] text-danger">{t("chat.translateFailed")}</span>}
      </>
    );
  };
  const translateMsg = (m: Message) => {
    const has = (m.content_translated && m.translated_to === tr.locale) || tr.done[m.id];
    setMsgView((v) => ({ ...v, [m.id]: "tr" }));
    if (!has) void tr.translate(m.id, m.content);
  };

  // Switch on → translate what's on screen from others (newest 40), in batches.
  useEffect(() => {
    if (!tr.auto) return;
    const todo = visible
      .filter(
        (m) =>
          m.sender_id !== currentUserId &&
          !m.id.startsWith("temp-") &&
          m.content?.trim() &&
          !(m.content_translated && m.translated_to === tr.locale) &&
          !tr.done[m.id] && !tr.same[m.id] && !tr.busy[m.id] && !tr.failed[m.id] && !tr.skipped[m.id],
      )
      .slice(-40)
      .map((m) => ({ id: m.id, text: m.content }));
    if (todo.length) void tr.translateMany(todo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr.auto, tr.locale, visible]);

  // WhatsApp-style quoted reply: the message being answered, shown above the composer.
  const [quoting, setQuoting] = useState<Message | null>(null);
  useEffect(() => setQuoting(null), [selected]);
  const [flashId, setFlashId] = useState<string | null>(null);
  /** Double-click (or "Antworten") on a message, image, file or voice note → quote it. */
  const replyTo = (m: Message) => {
    if (m.id.startsWith("temp-") || m.parent_id) return;
    window.getSelection()?.removeAllRanges(); // double-click selects a word otherwise
    setQuoting(m);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };
  // The quote shows the text the way the reader sees it (translated when the switch is on).
  const shownText = (q: Message) => {
    if (q.sender_id === currentUserId) return q.content;
    const translated = (q.content_translated && q.translated_to === tr.locale ? q.content_translated : null) ?? tr.done[q.id];
    const view = msgView[q.id];
    return translated && (view === "tr" || (view !== "orig" && tr.auto)) ? translated : q.content;
  };
  const snippetOf = (q: Message) =>
    q.content?.trim()
      ? shownText(q).trim().replace(/\s+/g, " ").slice(0, 140)
      : q.attachment_mime?.startsWith("image/")
        ? `📷 ${q.attachment_name ?? t("chat.photo")}`
        : q.attachment_name
          ? `📎 ${q.attachment_name}`
          : "…";
  /** Double-click → open the message's thread (reply box focused there). */
  const openThread = (m: Message) => {
    if (m.id.startsWith("temp-") || m.parent_id) return;
    window.getSelection()?.removeAllRanges(); // double-click selects a word otherwise
    setThreadParentId(m.id);
  };
  /** Scroll to the quoted original and briefly highlight it. */
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
  };
  // History is paged: the server sends the newest CHAT_PAGE messages; older
  // ones load on demand (same RLS — the browser session reads them).
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 500);
  const [loadingOlder, setLoadingOlder] = useState(false);
  async function loadOlder() {
    const sb = createClient();
    const oldest = messagesRef.current.find((m) => !m.id.startsWith("temp-"))?.created_at;
    if (!sb || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    let q = sb.from("messages").select("*").lt("created_at", oldest).order("created_at", { ascending: false }).limit(500);
    q = internal ? q.is("client_id", null) : q.eq("client_id", clientId!);
    const { data } = await q;
    setLoadingOlder(false);
    const rows = ((data ?? []) as any[]).filter((m) => !seen.current.has(m.id)).reverse();
    rows.forEach((m) => seen.current.add(m.id));
    setHasOlder((data ?? []).length >= 500);
    if (rows.length) setMessages((prev) => [...rows.map(rowToMessage), ...prev]);
  }

  // Deep link from message search: ?msg=<id> opens its conversation (or thread) and jumps to it.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    const id = new URLSearchParams(window.location.search).get("msg");
    if (!id) return;
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    deepLinked.current = true;
    const parent = m.parent_id ? messages.find((x) => x.id === m.parent_id) : null;
    const target = parent ?? m;
    setSelected(threadKeyOf(target));
    if (parent) setThreadParentId(parent.id);
    window.setTimeout(() => jumpTo(target.id), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  const renderQuote = (replyToId: string) => {
    const q = messages.find((x) => x.id === replyToId);
    return (
      <button
        type="button"
        onClick={() => q && jumpTo(q.id)}
        className="mb-1 mt-1 flex w-full max-w-md flex-col items-start rounded-lg border-l-[3px] border-brand bg-surface-2/70 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2"
      >
        <span className="text-[11px] font-semibold text-brand">{q ? q.sender_name : t("chat.quoteMissing")}</span>
        {q && <span className="line-clamp-2 text-xs text-muted">{snippetOf(q)}</span>}
      </button>
    );
  };
  const footerFor = (m: Message, mineMsg: boolean, isTempMsg: boolean, hasTextMsg: boolean, groupedMsg = false) => (
    <>
      <ReactionChips
        reactions={reactionsByMsg[m.id] ?? []}
        currentUserId={currentUserId}
        nameOf={nameOf}
        onToggle={(e) => void toggleReaction(m.id, e)}
      />
      {!isTempMsg && editingId !== m.id && (
        <MessageActions
          // Right end of the message's own row: never covers the messages above
          // (beside the sender line, or the first text line for follow-ups).
          className={cn("absolute right-1 z-30", groupedMsg ? "-top-0.5" : "-top-1")}
          visible={hoveredMsg === m.id}
          canEdit={mineMsg && hasTextMsg}
          canDelete={mineMsg}
          canTranslate={!mineMsg && hasTextMsg}
          translating={!!tr.busy[m.id]}
          onReact={(e) => void toggleReaction(m.id, e)}
          onReply={!m.parent_id ? () => replyTo(m) : undefined}
          onThread={!m.parent_id ? () => setThreadParentId(m.id) : undefined}
          onTranslate={() => translateMsg(m)}
          onCopy={hasTextMsg ? () => copyText(shownText(m)) : undefined}
          pinned={!!m.pinned_at}
          onPin={!m.parent_id && !isTempMsg ? () => void togglePin(m) : undefined}
          onEdit={() => startEdit(m)}
          onDelete={() => deleteMsg(m.id)}
        />
      )}
    </>
  );
  const insertAtCaret = (text: string) => {
    const el = composerRef.current;
    const start = el?.selectionStart ?? val.length;
    const end = el?.selectionEnd ?? val.length;
    setVal(val.slice(0, start) + text + val.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  };

  useEffect(() => {
    if (initialSelected && peers.some((p) => p.id === initialSelected)) setSelected(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelected]);

  async function translateDraft(target: "de" | "en") {
    const text = val.trim();
    if (!text || translating) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.translation) setVal(data.translation);
      else setUploadError(t("chat.translateFailed"));
    } catch {
      setUploadError(t("chat.translateFailed"));
    } finally {
      setTranslating(false);
    }
  }

  const threadReplies = useMemo(
    () => threadParentId ? messages.filter((m) => m.parent_id === threadParentId) : [],
    [messages, threadParentId],
  );
  const threadParent = threadParentId ? messages.find((m) => m.id === threadParentId) : null;

  const lastByThread = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of messages) {
      if (!m.parent_id) map[threadKeyOf(m)] = m;
    }
    return map;
  }, [messages]);

  const dateDividers = useMemo(() => {
    const s = new Set<string>();
    const result: Record<string, string> = {};
    for (const m of visible) {
      const d = m.created_at.slice(0, 10);
      if (!s.has(d)) {
        s.add(d);
        result[m.id] = formatDate(m.created_at, t);
      }
    }
    return result;
  }, [visible, t]);

  const threadedMessages = useMemo(
    () => messages.filter((m) => (m.reply_count ?? 0) > 0 && !m.parent_id).sort((a, b) => {
      const aTime = a.last_reply_at ?? a.created_at;
      const bTime = b.last_reply_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    }),
    [messages],
  );

  const mentionedMessages = useMemo(
    () => messages.filter((m) => {
      if (m.sender_id === currentUserId) return false;
      const content = m.content?.toLowerCase() ?? "";
      return content.includes(`@${currentName.toLowerCase()}`);
    }).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [messages, currentUserId, currentName],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible]);

  useEffect(() => {
    setUnread((u) => (u[selected] ? { ...u, [selected]: 0 } : u));
  }, [selected]);

  // Realtime subscription
  useEffect(() => {
    if (!clientId && !internal) return;
    const supabase = createClient();
    if (!supabase) return;
    const base = internal
      ? { schema: "public" as const, table: "messages" as const }
      : { schema: "public" as const, table: "messages" as const, filter: `client_id=eq.${clientId}` };
    const mine = (m: any) => (internal ? m.client_id == null : m.client_id === clientId);
    const participant = (m: any) => !m.recipient_id || m.sender_id === currentUserId || m.recipient_id === currentUserId;
    // "*" so new columns (reply_to_id, migration 0040) arrive without breaking older databases.
    const SELECT = "*";
    const toMsg = rowToMessage;
    const channel = supabase
      .channel(internal ? "messages:internal" : `messages:${clientId}`)
      .on("postgres_changes", { event: "INSERT", ...base }, (payload) => {
        const m = payload.new as any;
        if (!mine(m) || !participant(m) || seen.current.has(m.id)) return;
        seen.current.add(m.id);
        const msg = toMsg(m);
        setMessages((prev) => [...prev, msg]);
        if (msg.parent_id) {
          setMessages((prev) => prev.map((x) => x.id === msg.parent_id ? { ...x, reply_count: (x.reply_count ?? 0) + 1, last_reply_at: msg.created_at } : x));
        }
        const key = !msg.recipient_id ? GROUP : msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
        if (msg.sender_id !== currentUserId && key !== selectedRef.current && !msg.parent_id) {
          setUnread((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }));
        }
      })
      .on("postgres_changes", { event: "UPDATE", ...base }, (payload) => {
        const m = payload.new as any;
        if (!mine(m)) return;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? toMsg(m) : x)));
      })
      .on("postgres_changes", { event: "DELETE", ...base }, (payload) => {
        const oldId = (payload.old as any)?.id;
        if (oldId) setMessages((prev) => prev.filter((x) => x.id !== oldId));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void backfill();
      });

    async function backfill() {
      const known = messagesRef.current.filter((m) => !m.id.startsWith("temp-"));
      const since = known.reduce<string | null>((a, m) => (a && a >= m.created_at ? a : m.created_at), null);
      let q = supabase!.from("messages").select(SELECT).order("created_at", { ascending: true });
      q = internal ? q.is("client_id", null) : q.eq("client_id", clientId!);
      if (since) q = q.gt("created_at", since);
      const { data } = await q;
      if (!data?.length) return;
      const fresh = (data as any[]).filter((m) => mine(m) && participant(m) && !seen.current.has(m.id));
      if (!fresh.length) return;
      fresh.forEach((m) => seen.current.add(m.id));
      setMessages((prev) => [...prev, ...fresh.map(toMsg)]);
    }

    return () => { supabase.removeChannel(channel); };
  }, [clientId, currentUserId, internal]);

  // Actions
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = val.trim();
    if (!content) return;
    setVal("");
    setMentionQuery(null);
    setUploadError(null);
    const recipientId = selected === GROUP ? null : selected;
    const mentionIds = extractMentions(content, peers);
    const replyToId = quoting?.id ?? null;
    setQuoting(null);
    typing.stop();
    const tempId = `temp-${Date.now()}`;
    seen.current.add(tempId);
    setMessages((m) => [...m, {
      id: tempId, client_id: clientId ?? "", sender_id: currentUserId, sender_name: currentName, sender_role: currentRole,
      recipient_id: recipientId, reply_to_id: replyToId, content, created_at: new Date().toISOString(),
    }]);
    const res = await fetch("/api/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, clientId, recipientId, internal, mentions: mentionIds, replyToId }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        // Server is the source of truth for reply_to_id / parent_id (it may
        // fall back to a thread reply before migration 0040).
        const fix = { id: message.id, reply_to_id: message.reply_to_id ?? null, parent_id: message.parent_id ?? null };
        setMessages((m) => m.some((x) => x.id === message.id) ? m.filter((x) => x.id !== tempId) : m.map((x) => (x.id === tempId ? { ...x, ...fix } : x)));
        // Fell back to a thread reply: recount from the list (realtime may already have counted it).
        if (fix.parent_id) {
          setMessages((m) => {
            const count = m.filter((x) => x.parent_id === fix.parent_id).length;
            return m.map((x) => (x.id === fix.parent_id ? { ...x, reply_count: count, last_reply_at: new Date().toISOString() } : x));
          });
        }
      }
      return;
    }
    if (replyToId) setQuoting(messages.find((x) => x.id === replyToId) ?? null);
    // Failed: remove the optimistic bubble and give the text back to the user.
    setMessages((m) => m.filter((x) => x.id !== tempId));
    setVal((v) => (v ? v : content));
    setUploadError(res?.status === 413 ? t("chat.tooLong") : t("chat.sendFailed"));
  }

  async function sendReply(content: string, parentId: string, mentions: string[]): Promise<boolean> {
    const recipientId = selected === GROUP ? null : selected;
    const tempId = `temp-${Date.now()}-reply`;
    seen.current.add(tempId);
    setMessages((m) => [...m, {
      id: tempId, client_id: clientId ?? "", sender_id: currentUserId, sender_name: currentName, sender_role: currentRole,
      recipient_id: recipientId, parent_id: parentId, content, created_at: new Date().toISOString(),
    }]);
    setMessages((m) => m.map((x) => x.id === parentId ? { ...x, reply_count: (x.reply_count ?? 0) + 1, last_reply_at: new Date().toISOString() } : x));
    const res = await fetch("/api/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, clientId, recipientId, internal, parentId, mentions }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        setMessages((m) => m.some((x) => x.id === message.id) ? m.filter((x) => x.id !== tempId) : m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)));
      }
      return true;
    }
    // Roll back the optimistic reply so it never looks sent when it wasn't.
    setMessages((m) =>
      m
        .filter((x) => x.id !== tempId)
        .map((x) => (x.id === parentId ? { ...x, reply_count: Math.max(0, (x.reply_count ?? 1) - 1) } : x)),
    );
    setUploadError(res?.status === 413 ? t("chat.tooLong") : t("chat.sendFailed"));
    return false;
  }

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [val]);

  function named(f: File): File {
    if (f.name) return f;
    const ext = (f.type.split("/")[1] || "png").split("+")[0];
    return new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type || "application/octet-stream" });
  }

  function stageFiles(files: File[]) {
    const staged = files.map((raw) => {
      const file = named(raw);
      return { id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null };
    });
    setPendingAtt((p) => [...p, ...staged]);
  }

  function removePending(id: string) {
    setPendingAtt((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });
  }

  async function uploadFile(file: File, caption?: string) {
    if (!file) return;
    const recipientId = selected === GROUP ? null : selected;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    seen.current.add(tempId);
    setMessages((m) => [...m, {
      id: tempId, client_id: clientId ?? "", sender_id: currentUserId, sender_name: currentName, sender_role: currentRole,
      recipient_id: recipientId, content: caption?.trim() || "", attachment_name: file.name, attachment_mime: file.type || "application/octet-stream",
      attachment_size: file.size, created_at: new Date().toISOString(),
    }]);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (caption?.trim()) fd.append("caption", caption.trim());
    if (clientId) fd.append("clientId", clientId);
    if (recipientId) fd.append("recipientId", recipientId);
    if (internal) fd.append("internal", "true");
    const res = await fetch("/api/messages/attachment", { method: "POST", body: fd }).catch(() => null);
    setUploading(false);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        setMessages((m) => m.some((x) => x.id === message.id) ? m.filter((x) => x.id !== tempId) : m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)));
      }
    } else {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      const err = res ? (await res.json().catch(() => null))?.error : null;
      setUploadError(err || "Upload failed.");
      setTimeout(() => setUploadError(null), 4000);
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (pendingAtt.length) {
      const caption = val.trim();
      const files = pendingAtt;
      setPendingAtt([]);
      setVal("");
      for (let i = 0; i < files.length; i++) {
        await uploadFile(files[i].file, i === 0 ? caption : undefined);
        if (files[i].url) URL.revokeObjectURL(files[i].url!);
      }
      return;
    }
    await send();
  }

  function startEdit(m: Message) { setEditingId(m.id); setEditVal(m.content); }

  async function saveEdit(id: string) {
    const content = editVal.trim();
    if (!content) return;
    const prev = messages.find((x) => x.id === id);
    setEditingId(null);
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, content, edited_at: new Date().toISOString() } : x)));
    const res = await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, content }) }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, ...message } : x)));
    } else if (prev) {
      setMessages((ms) => ms.map((x) => (x.id === id ? prev : x)));
    }
  }

  async function deleteMsg(id: string) {
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    const snapshot = messages;
    setMessages((ms) => ms.filter((x) => x.id !== id));
    const res = await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setMessages(snapshot); }
  }

  function pickQuickReply(r: QuickReply) {
    // DM → that person; group chat → the client's contact when there is exactly one.
    const clientPeers = peers.filter((p) => p.role === "client");
    const peer = selected === GROUP ? (clientPeers.length === 1 ? clientPeers[0] : null) : peers.find((p) => p.id === selected);
    setVal(fillQuickReply(r.body, { company: title, name: peer?.name.split(" ")[0] ?? "", me: currentName.split(" ")[0] }));
    setQrIndex(0);
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  async function togglePin(m: Message) {
    const next = !m.pinned_at;
    const prev = { pinned_at: m.pinned_at ?? null, pinned_by: m.pinned_by ?? null };
    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, pinned_at: next ? new Date().toISOString() : null, pinned_by: next ? currentUserId : null } : x)));
    const err = await setPinned(m.id, next);
    if (err) {
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, ...prev } : x)));
      setUploadError(err);
      setTimeout(() => setUploadError(null), 4000);
    }
  }

  function onComposerInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    setVal(newVal);
    if (newVal.trim()) typing.notify();
    const pos = e.target.selectionStart ?? 0;
    const before = newVal.slice(0, pos);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionPos({ left: 60, bottom: 50 });
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(peer: ChatPeer) {
    const pos = composerRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    const atIdx = before.lastIndexOf("@");
    if (atIdx >= 0) {
      const newVal = val.slice(0, atIdx) + `@${peer.name} ` + val.slice(pos);
      setVal(newVal);
      setMentionQuery(null);
      requestAnimationFrame(() => {
        composerRef.current?.focus();
        const newPos = atIdx + peer.name.length + 2;
        composerRef.current?.setSelectionRange(newPos, newPos);
      });
    }
  }

  const activePeer = peers.find((p) => p.id === selected);
  const headerTitle = selected === GROUP ? title : activePeer?.name ?? title;
  const headerSubtitle = selected === GROUP
    ? (subtitle ?? t("chat.groupEveryone"))
    : activePeer?.title ?? t("chat.directMessage");

  const channelList: { key: string; name: string; sub: string; isGroup?: boolean; role?: Role }[] = [
    { key: GROUP, name: title, sub: internal ? t("chat.groupIntern") : t("chat.groupEveryone"), isGroup: true },
    ...peers.map((p) => ({ key: p.id, name: p.name, sub: p.title ?? p.role, role: p.role })),
  ];

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  // Staff see the client's logo on that client's group conversation; the client
  // sees the TyloTech team members instead.
  const clientLogo = useContext(ClientLogoContext);

  // In-app attachment preview (same tab): every finished attachment in view.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerItems: ViewerItem[] = useMemo(
    () =>
      shown
        .filter((m) => m.attachment_mime && !m.id.startsWith("temp-"))
        .map((m) => ({
          id: m.id,
          name: m.attachment_name ?? "Datei",
          mime: m.attachment_mime!,
          url: `/api/messages/attachment?id=${m.id}`,
          sender: m.sender_name,
          createdAt: m.created_at,
        })),
    [shown],
  );
  const openViewer = (id: string) => {
    const i = viewerItems.findIndex((v) => v.id === id);
    if (i >= 0) setViewerIndex(i);
  };
  const groupLogo = !internal && currentRole !== "client" ? clientLogo : null;

  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-bg", className)}>
      <AttachmentViewer items={viewerItems} index={viewerIndex} onIndex={setViewerIndex} onClose={() => setViewerIndex(null)} />
      {/* ── Chat sidebar ─────────────────────────────────────────── */}
      {peers.length > 0 && (
        <div className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-surface/50 md:flex">
          {/* Tabs: Chats · Threads · Erwähnungen */}
          <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
            {([
              { key: "channels" as const, label: t("chat.conversations") },
              { key: "threads" as const, label: t("chat.thread") },
              { key: "mentions" as const, label: t("chat.mention") },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSidebarTab(tab.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  sidebarTab === tab.key
                    ? "bg-bg text-foreground shadow-sm border border-border"
                    : "text-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* Chats tab */}
            {sidebarTab === "channels" && channelList.map((ch) => {
              const last = lastByThread[ch.key];
              const isActive = selected === ch.key;
              const count = unread[ch.key] ?? 0;
              return (
                <button
                  key={ch.key}
                  onClick={() => { setSelected(ch.key); setThreadParentId(null); }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors border-l-2",
                    isActive
                      ? "bg-brand/[0.06] border-l-brand"
                      : "border-l-transparent hover:bg-surface-2",
                  )}
                >
                  {ch.isGroup ? (
                    groupLogo ? (
                      <Avatar name={ch.name} src={groupLogo} logo size={36} />
                    ) : (
                      <div className="relative flex shrink-0">
                        {peers.slice(0, 2).map((p, i) => (
                          <Avatar key={p.id} name={p.name} size={32} className={cn("ring-2 ring-surface", i > 0 && "-ml-2")} />
                        ))}
                      </div>
                    )
                  ) : (
                    <SenderAvatar name={ch.name} role={ch.role} size={36} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("truncate text-sm", isActive ? "font-semibold text-foreground" : "font-medium text-foreground")}>{ch.name}</span>
                      <span className="shrink-0 text-[11px] text-muted">
                        {last ? formatTime(last.created_at) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="truncate text-xs text-muted">
                        {ch.sub}
                      </span>
                      {count > 0 && (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">{count}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Threads tab */}
            {sidebarTab === "threads" && (
              threadedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <MessageCircle className="mb-2 h-8 w-8 text-muted/30" />
                  <p className="text-sm text-muted">{t("chat.noMessages")}</p>
                </div>
              ) : threadedMessages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setThreadParentId(m.id); setSidebarTab("channels"); }}
                  className={cn(
                    "flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors border-l-2",
                    threadParentId === m.id ? "bg-brand/[0.06] border-l-brand" : "border-l-transparent hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 shrink-0 text-brand" />
                    <span className="truncate text-sm font-semibold text-foreground">{m.content?.slice(0, 50) || "Thread"}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-5">
                    <div className="flex -space-x-1">
                      <SenderAvatar name={m.sender_name} role={m.sender_role} size={18} className="ring-1 ring-surface" />
                    </div>
                    <span className="text-xs text-muted">{m.reply_count} {t("chat.replies")} · {formatRelativeTime(m.last_reply_at ?? m.created_at)}</span>
                    {(unread[m.id] ?? 0) > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-brand-foreground">{unread[m.id]}</span>
                    )}
                  </div>
                </button>
              ))
            )}

            {/* Mentions tab */}
            {sidebarTab === "mentions" && (
              mentionedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <AtSign className="mb-2 h-8 w-8 text-muted/30" />
                  <p className="text-sm text-muted">{t("chat.noMessages")}</p>
                </div>
              ) : mentionedMessages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (m.parent_id) setThreadParentId(m.parent_id);
                    setSidebarTab("channels");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 border-l-transparent hover:bg-surface-2"
                >
                  <SenderAvatar name={m.sender_name} role={m.sender_role} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-semibold text-foreground">{m.sender_name}</span>
                    </div>
                    <p className="truncate text-xs text-muted mt-0.5">
                      {t("chat.mentionedYouIn", { where: title })}
                    </p>
                    <p className="text-[11px] text-muted/60 mt-0.5">{formatRelativeTime(m.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Main chat area ───────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          {(() => {
            const identity = (
              <div className="flex min-w-0 items-center gap-3">
                {selected === GROUP ? (
                  groupLogo ? (
                    <Avatar name={headerTitle} src={groupLogo} logo size={36} />
                  ) : (
                    <div className="relative flex shrink-0">
                      {peers.slice(0, 3).map((p, i) => (
                        <Avatar key={p.id} name={p.name} size={32} className={cn("ring-2 ring-bg", i > 0 && "-ml-2")} />
                      ))}
                    </div>
                  )
                ) : (
                  <SenderAvatar name={headerTitle} role={peers.find((p) => p.id === selected)?.role} size={36} />
                )}
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold text-foreground">{headerTitle}</p>
                  <p className="truncate text-[11px] text-muted">{headerSubtitle}</p>
                </div>
              </div>
            );
            if (searchOpen) {
              return (
                <div className="relative mr-2 min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    autoFocus
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearchOpen(false);
                        setSearchQ("");
                      }
                    }}
                    placeholder={t("chat.searchPlaceholder")}
                    className="h-9 w-full rounded-xl border border-border bg-surface pl-9 pr-16 text-sm outline-none focus:border-brand/50"
                  />
                  {q && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted">
                      {shown.length}/{visible.length}
                    </span>
                  )}
                </div>
              );
            }
            return (
              <>
                <div className="hidden min-w-0 md:block">{identity}</div>
                <div className="min-w-0 md:hidden">
                  {peers.length > 0 ? (
                    <Menu
                      width={260}
                      trigger={({ toggle, open }) => (
                        <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 items-center gap-2">
                          {identity}
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
                        </button>
                      )}
                    >
                      {(close) => (
                        <>
                          <MenuLabel>{t("chat.conversations")}</MenuLabel>
                          {channelList.map((ch) => (
                            <MenuItem
                              key={ch.key}
                              icon={ch.isGroup && groupLogo ? <Avatar name={ch.name} src={groupLogo} logo size={18} /> : <SenderAvatar name={ch.name} role={ch.role} size={18} />}
                              selected={selected === ch.key}
                              onSelect={() => {
                                setSelected(ch.key);
                                setThreadParentId(null);
                                close();
                              }}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate">{ch.name}</span>
                                {(unread[ch.key] ?? 0) > 0 && (
                                  <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-brand-foreground">
                                    {unread[ch.key]}
                                  </span>
                                )}
                              </span>
                            </MenuItem>
                          ))}
                        </>
                      )}
                    </Menu>
                  ) : (
                    identity
                  )}
                </div>
              </>
            );
          })()}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              role="switch"
              aria-checked={tr.auto}
              onClick={() => tr.setAuto(!tr.auto)}
              title={t("chat.autoTranslateHint")}
              className={cn(
                "mr-1 flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                tr.auto ? "border-brand/40 bg-brand/10 text-foreground" : "border-border text-muted hover:text-foreground",
              )}
            >
              <Languages className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("chat.autoTranslate")}</span>
              <span
                aria-hidden
                className={cn("relative h-4 w-7 rounded-full transition-colors", tr.auto ? "bg-brand" : "bg-surface-2 ring-1 ring-border")}
              >
                <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all", tr.auto ? "left-3.5" : "left-0.5")} />
              </span>
            </button>
            <button
              type="button"
              aria-label={t("chat.search")}
              aria-pressed={searchOpen}
              onClick={() => {
                setSearchOpen((o) => !o);
                setSearchQ("");
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-foreground",
                searchOpen ? "bg-surface-2 text-foreground" : "text-muted",
              )}
            >
              {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
            <Menu
              width={220}
              align="end"
              trigger={({ toggle, open }) => (
                <button
                  type="button"
                  aria-label={t("chat.more")}
                  aria-expanded={open}
                  onClick={toggle}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={<ArrowDown className="h-4 w-4" />}
                    onSelect={() => {
                      close();
                      endRef.current?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    {t("chat.jumpLatest")}
                  </MenuItem>
                  <MenuItem
                    icon={<CheckCheck className="h-4 w-4" />}
                    onSelect={() => {
                      close();
                      setUnread({});
                    }}
                  >
                    {t("chat.markAllRead")}
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>

        {/* Messages + thread panel */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
            <PinnedBar
              pinned={visible.filter((m) => m.pinned_at)}
              snippetOf={(m) => snippetOf(m)}
              onJump={jumpTo}
              onUnpin={(m) => void togglePin(m)}
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {hasOlder && !q && (
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={loadingOlder}
                    className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
                    {t("chat.loadOlder")}
                  </button>
                </div>
              )}
              {shown.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  {q ? (
                    <>
                      <Search className="mb-3 h-10 w-10 text-muted/20" />
                      <p className="text-sm font-medium text-foreground">{t("chat.noSearchResults")}</p>
                    </>
                  ) : (
                    <>
                      <MessageCircle className="mb-3 h-10 w-10 text-muted/20" />
                      <p className="text-sm font-medium text-foreground">{t("chat.noMessages")}</p>
                      <p className="mt-1 text-xs text-muted">{t("chat.sayHello")}</p>
                    </>
                  )}
                </div>
              )}
              {shown.map((m, idx) => {
                const mine = m.sender_id === currentUserId;
                const prevMsg = idx > 0 ? shown[idx - 1] : null;
                const sameSender = prevMsg?.sender_id === m.sender_id && !dateDividers[m.id];
                const withinWindow = prevMsg && new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;
                const grouped = sameSender && withinWindow;
                const hasText = !!(m.content && m.content.trim());
                const mime = m.attachment_mime || "";
                const hasAttachment = !!mime;
                const isTemp = m.id.startsWith("temp-");
                const attUrl = `/api/messages/attachment?id=${m.id}`;
                const divider = dateDividers[m.id];
                const replyCount = m.reply_count ?? 0;

                return (
                  <div key={m.id}>
                    {firstUnreadId === m.id && (
                      <div className="my-4 flex items-center gap-3" role="separator">
                        <div className="h-px flex-1 bg-brand/40" />
                        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand">{t("chat.newMessages")}</span>
                        <div className="h-px flex-1 bg-brand/40" />
                      </div>
                    )}
                    {divider && (
                      <div className="my-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[12px] font-medium text-muted">{divider}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}

                    <div
                      id={`msg-${m.id}`}
                      className={cn(
                        "group relative rounded-lg transition-colors duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                        grouped ? "mt-0.5" : "mt-5",
                        flashId === m.id && "bg-brand/10",
                      )}
                      onMouseEnter={() => setHoveredMsg(m.id)}
                      onMouseLeave={() => setHoveredMsg(null)}
                      onDoubleClick={(e) => {
                        // Not while editing or when double-clicking a button/link inside.
                        if (editingId === m.id || (e.target as HTMLElement).closest("button,a,textarea,input")) return;
                        openThread(m);
                      }}
                      title={!isTemp && !m.parent_id ? t("chat.doubleClickReply") : undefined}
                      // Keyboard users: tab onto a message to reveal its actions.
                      tabIndex={isTemp ? undefined : 0}
                      onFocus={() => setHoveredMsg(m.id)}
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoveredMsg(null);
                      }}
                    >
                      {!grouped ? (
                        <div className="flex gap-3">
                          <SenderAvatar name={m.sender_name} role={m.sender_role} size={36} className="mt-0.5 shrink-0" />
                          <div className="relative min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-foreground">{m.sender_name}</span>
                              <span className="text-[11px] text-muted">{formatTime(m.created_at)}</span>
                            </div>

                            {m.reply_to_id && renderQuote(m.reply_to_id)}
                            {hasAttachment && renderAttachment(m, isTemp, attUrl, () => openViewer(m.id))}

                            {editingId === m.id ? (
                              <div className="mt-1 flex flex-col gap-1.5">
                                <textarea autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m.id); } if (e.key === "Escape") setEditingId(null); }}
                                  rows={Math.min(6, Math.max(2, editVal.split("\n").length))}
                                  className="w-full resize-y rounded-xl border border-brand/50 bg-bg/60 px-3 py-2 text-sm leading-relaxed text-foreground outline-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button onClick={() => saveEdit(m.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground"><Check className="h-3.5 w-3.5" /> {t("chat.save")}</button>
                                  <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground">{t("chat.cancel")}</button>
                                </div>
                              </div>
                            ) : hasText ? (
                              <div className="mt-1 rounded-xl border-l-2 border-brand/30 pl-3 py-1 text-sm leading-relaxed text-foreground">
                                {renderText(m)}
                              </div>
                            ) : null}

                            {replyCount > 0 && (
                              <button
                                onClick={() => setThreadParentId(m.id)}
                                className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand transition-colors hover:underline"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                {replyCount} {t("chat.replies")}
                              </button>
                            )}
                            {footerFor(m, mine, isTemp, hasText)}
                          </div>
                        </div>
                      ) : (
                        <div className="relative pl-[48px]">
                          <span className="invisible absolute left-3 top-1.5 text-[10px] text-muted/40 group-hover:visible">{formatTime(m.created_at)}</span>
                          {m.reply_to_id && renderQuote(m.reply_to_id)}
                            {hasAttachment && renderAttachment(m, isTemp, attUrl, () => openViewer(m.id))}
                          {editingId === m.id ? (
                            <div className="flex flex-col gap-1.5">
                              <textarea autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m.id); } if (e.key === "Escape") setEditingId(null); }}
                                rows={Math.min(6, Math.max(2, editVal.split("\n").length))}
                                className="w-full resize-y rounded-xl border border-brand/50 bg-bg/60 px-3 py-2 text-sm leading-relaxed text-foreground outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <button onClick={() => saveEdit(m.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground"><Check className="h-3.5 w-3.5" /> {t("chat.save")}</button>
                                <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground">{t("chat.cancel")}</button>
                              </div>
                            </div>
                          ) : hasText ? (
                            <div className="rounded-xl border-l-2 border-brand/30 pl-3 py-1 text-sm leading-relaxed text-foreground">
                              {renderText(m)}
                            </div>
                          ) : null}
                          {replyCount > 0 && (
                            <button onClick={() => setThreadParentId(m.id)} className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline">
                              <MessageCircle className="h-3.5 w-3.5" /> {replyCount} {t("chat.replies")}
                            </button>
                          )}
                          {footerFor(m, mine, isTemp, hasText, true)}
                        </div>
                      )}
                      {lastMineId === m.id && (
                        <SeenLine messageAt={m.created_at} reads={reads} nameOf={nameOf} isDm={selected !== GROUP} />
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <TypingLine names={typing.names} />
            {/* Composer */}
            {uploadError && <p className="shrink-0 border-t border-border px-4 pt-2 text-xs text-danger">{uploadError}</p>}
            <form
              onSubmit={submit}
              onDrop={(e) => { const files = Array.from(e.dataTransfer?.files ?? []); if (files.length) { e.preventDefault(); setDragOver(false); stageFiles(files); } }}
              onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
              onDragLeave={() => setDragOver(false)}
              className="relative shrink-0 border-t border-border px-5 py-3"
            >
              <input ref={fileRef} type="file" multiple className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt"
                onChange={(e) => { stageFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
              <AnimatePresence>
                {mentionQuery !== null && peers.length > 0 && (
                  <MentionPopup peers={peers} query={mentionQuery} onSelect={insertMention} position={mentionPos} />
                )}
              </AnimatePresence>
              {slash && qr.ready && (
                <QuickReplyPopup
                  items={qrMatches}
                  query={slash[1] ?? ""}
                  active={Math.min(qrIndex, Math.max(0, qrMatches.length - 1))}
                  onHover={setQrIndex}
                  onPick={pickQuickReply}
                  onManage={() => setQrManage(true)}
                />
              )}
              {isStaffUser && (
                <QuickRepliesModal open={qrManage} onClose={() => setQrManage(false)} items={qr.items} ready={qr.ready} onChanged={() => void qr.reload()} />
              )}

              <div className={cn("relative rounded-2xl border bg-bg transition-colors", dragOver ? "border-brand bg-brand/[0.04]" : "border-border focus-within:border-brand/40")}>
                {quoting && (
                  <div className="flex items-start gap-2 border-b border-border/60 px-3 py-2">
                    <div className="min-w-0 flex-1 rounded-lg border-l-[3px] border-brand bg-surface-2/70 px-2.5 py-1.5">
                      <p className="text-[11px] font-semibold text-brand">
                        {t("chat.replyingTo", { name: quoting.sender_id === currentUserId ? t("chat.yourself") : quoting.sender_name })}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted">{snippetOf(quoting)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuoting(null)}
                      aria-label={t("chat.cancelReply")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {pendingAtt.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-b border-border/60 p-2">
                    {pendingAtt.map((a) => (
                      <div key={a.id} className="group/att relative">
                        {a.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt={a.file.name} className="h-16 w-16 rounded-lg border border-border object-cover" />
                        ) : (
                          <div className="flex h-16 w-28 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2">
                            <FileText className="h-5 w-5 shrink-0 text-brand" />
                            <span className="min-w-0"><span className="block truncate text-[11px] font-medium">{a.file.name}</span><span className="block text-[10px] text-muted">{formatBytes(a.file.size)}</span></span>
                          </div>
                        )}
                        <button type="button" onClick={() => removePending(a.id)} aria-label={t("chat.remove")} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  ref={composerRef}
                  value={val}
                  onChange={onComposerInput}
                  onKeyDown={(e) => {
                    if (slash && qrMatches.length) {
                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setQrIndex((i) => (i + (e.key === "ArrowDown" ? 1 : qrMatches.length - 1)) % qrMatches.length);
                        return;
                      }
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        pickQuickReply(qrMatches[Math.min(qrIndex, qrMatches.length - 1)]!);
                        return;
                      }
                    }
                    if (e.key === "Escape" && slash) {
                      e.preventDefault();
                      setVal("");
                      return;
                    }
                    if (e.key === "Escape" && quoting) {
                      e.preventDefault();
                      setQuoting(null);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.items ?? []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f);
                    if (files.length) { e.preventDefault(); stageFiles(files); }
                  }}
                  rows={1}
                  data-chat-composer
                  placeholder={selected === GROUP ? t("chat.writeTeam") : t("chat.messagePerson", { name: headerTitle })}
                  className="max-h-[160px] min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted/50"
                />

                <div className="flex items-center justify-between px-3 pb-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmojiOpen((o) => !o)}
                      aria-label={t("chat.addEmoji")}
                      title={t("chat.addEmoji")}
                      aria-expanded={emojiOpen}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    <EmojiPicker
                      open={emojiOpen}
                      onClose={() => setEmojiOpen(false)}
                      onPick={(e) => insertAtCaret(e)}
                      className="bottom-14 left-3"
                    />
                    <VoiceRecorder onRecorded={(f) => void uploadFile(f)} disabled={uploading} />
                    <Menu
                      width={220}
                      trigger={({ toggle, open }) => (
                        <button
                          type="button"
                          aria-label={t("chat.translateDraft")}
                          title={t("chat.translateDraft")}
                          aria-expanded={open}
                          disabled={!val.trim() || translating}
                          onClick={toggle}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
                        >
                          {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </button>
                      )}
                    >
                      {(close) => (
                        <>
                          <MenuLabel>{t("chat.translateDraft")}</MenuLabel>
                          <MenuItem onSelect={() => { close(); void translateDraft("de"); }}>Deutsch</MenuItem>
                          <MenuItem onSelect={() => { close(); void translateDraft("en"); }}>English</MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-[11px] text-muted/50 sm:block">{t("chat.composerHintFigma")}</span>
                    <button
                      type="submit"
                      aria-label={t("chat.send")}
                      disabled={!val.trim() && !pendingAtt.length}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          {/* Thread panel */}
          <AnimatePresence>
            {threadParent && threadParentId && (
              <ThreadPanel
                parent={threadParent}
                replies={threadReplies}
                currentUserId={currentUserId}
                currentName={currentName}
                currentRole={currentRole}
                clientId={clientId}
                internal={internal}
                onClose={() => setThreadParentId(null)}
                onSend={sendReply}
                peers={peers}
                renderBody={(m) => (
                  <>
                    {m.content ? renderText(m) : null}
                    <ReactionChips
                      reactions={reactionsByMsg[m.id] ?? []}
                      currentUserId={currentUserId}
                      nameOf={nameOf}
                      onToggle={(e) => void toggleReaction(m.id, e)}
                    />
                  </>
                )}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** A messages row (Realtime payload or query) → Message. */
function rowToMessage(m: any): Message {
  return {
    id: m.id, client_id: m.client_id, sender_id: m.sender_id, sender_name: m.sender_name ?? "TyloTech",
    sender_role: (m.sender_role ?? "team") as Role, recipient_id: m.recipient_id ?? null,
    parent_id: m.parent_id ?? null, reply_to_id: m.reply_to_id ?? null, reply_count: m.reply_count ?? 0, last_reply_at: m.last_reply_at ?? null,
    content: m.content ?? "", content_translated: m.content_translated ?? null, translated_to: m.translated_to ?? null,
    attachment_name: m.attachment_name ?? null, attachment_mime: m.attachment_mime ?? null,
    attachment_size: m.attachment_size ?? null, edited_at: m.edited_at ?? null, created_at: m.created_at,
    pinned_at: m.pinned_at ?? null, pinned_by: m.pinned_by ?? null,
  };
}

function renderAttachment(m: Message, isTemp: boolean, attUrl: string, onOpen: () => void) {
  const mime = m.attachment_mime || "";
  return (
    <div className="mt-1 mb-1">
      {isTemp ? (
        <div className="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="max-w-[200px] truncate">{m.attachment_name}</span>
        </div>
      ) : mime.startsWith("image/") ? (
        <button type="button" onClick={onOpen} className="block cursor-zoom-in" aria-label={m.attachment_name ?? "image"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={attUrl} alt={m.attachment_name ?? "image"} className="max-h-72 max-w-sm rounded-xl border border-border object-cover transition-opacity hover:opacity-90" />
        </button>
      ) : mime.startsWith("video/") ? (
        <video src={attUrl} controls className="max-h-72 max-w-sm rounded-xl border border-border" />
      ) : mime.startsWith("audio/") ? (
        <audio src={attUrl} controls className="w-64 max-w-full" />
      ) : (
        <button type="button" onClick={onOpen}
          className="inline-flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-left text-sm transition-colors hover:border-brand/40">
          <FileText className="h-5 w-5 shrink-0 text-brand" />
          <span className="min-w-0">
            <span className="block max-w-[200px] truncate font-medium text-foreground">{m.attachment_name}</span>
            {m.attachment_size ? <span className="block text-[10px] text-muted">{mime.split("/")[0].toUpperCase()} · {formatBytes(m.attachment_size)}</span> : null}
          </span>
        </button>
      )}
    </div>
  );
}
