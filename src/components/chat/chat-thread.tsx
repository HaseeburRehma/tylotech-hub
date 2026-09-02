"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AtSign,
  Bold,
  Check,
  ChevronRight,
  Download,
  FileText,
  Hash,
  Headphones,
  Highlighter,
  Languages,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Send,
  Smile,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ChatPeer, Message, Role } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

const GROUP = "group";

// Quick-reaction emoji palette
const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "💯"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && d.getDate() === now.getDate()) return "Today";
    if (diff < 172800000) return "Yesterday";
    return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

/**
 * Render lightweight markdown (bold **…**, highlight ==…==) as safe HTML.
 */
function renderRich(text: string): string {
  const esc = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  return esc
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=\n]+)==/g, '<mark style="background:rgba(201,168,76,.38);color:inherit;border-radius:3px;padding:0 2px">$1</mark>')
    .replace(/@([A-Za-zÀ-ÿ][\w\s]{0,30}[\w])/g, '<span class="mention-tag">@$1</span>');
}

// ─── Mention autocomplete popup ─────────────────────────────────────────────
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
          <Avatar name={p.name} size={24} />
          <span className="font-medium">{p.name}</span>
          <span className="ml-auto text-[10px] text-muted/60">{p.role}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Emoji picker popup ─────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const MORE_EMOJI = ["😊", "😍", "🤔", "😢", "😎", "🙏", "👏", "💪", "🚀", "⭐", "💡", "📌", "🎯", "❌", "⚡", "🔒"];
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute bottom-full right-0 z-50 mb-1 grid w-[280px] grid-cols-8 gap-0.5 rounded-xl border border-border bg-surface p-2 shadow-xl"
    >
      {[...QUICK_EMOJI, ...MORE_EMOJI].map((e) => (
        <button
          key={e}
          onClick={() => { onSelect(e); onClose(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-surface-2"
        >
          {e}
        </button>
      ))}
    </motion.div>
  );
}

// ─── Hover action bar ─────────────────────────────────────────────────────────
function HoverActions({
  mine,
  onReply,
  onReact,
  onEdit,
  onDelete,
  hasText,
}: {
  mine: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  hasText: boolean;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  return (
    <div className={cn("absolute -top-4 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-0.5 shadow-md", mine ? "right-0" : "left-10")}>
      {QUICK_EMOJI.slice(0, 4).map((e) => (
        <button key={e} onClick={() => onReact(e)} className="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors hover:bg-surface-2">
          {e}
        </button>
      ))}
      <div className="relative">
        <button onClick={() => setShowEmoji(!showEmoji)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <Smile className="h-3.5 w-3.5" />
        </button>
        <AnimatePresence>
          {showEmoji && <EmojiPicker onSelect={onReact} onClose={() => setShowEmoji(false)} />}
        </AnimatePresence>
      </div>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button onClick={onReply} title="Reply in thread" className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
      </button>
      {mine && hasText && onEdit && (
        <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {mine && onDelete && (
        <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Thread panel (sidebar) ─────────────────────────────────────────────────
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
}: {
  parent: Message;
  replies: Message[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
  internal: boolean;
  onClose: () => void;
  onSend: (content: string, parentId: string, mentions: string[]) => Promise<void>;
  peers: ChatPeer[];
}) {
  const t = useT();
  const [val, setVal] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  // Auto-grow
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
    // Extract mentions
    const mentionIds = extractMentions(content, peers);
    await onSend(content, parent.id, mentionIds);
    setSending(false);
  }

  const allMsgs = [parent, ...replies];

  return (
    <motion.div
      initial={{ x: 340 }}
      animate={{ x: 0 }}
      exit={{ x: 340 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="flex w-[340px] shrink-0 flex-col border-l border-border bg-bg"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{t("chat.thread")}</p>
          <p className="text-[11px] text-muted">{parent.sender_name} · {replies.length} {replies.length === 1 ? "reply" : "replies"}</p>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {allMsgs.map((m, i) => {
          const mine = m.sender_id === currentUserId;
          const prevSame = i > 0 && allMsgs[i - 1].sender_id === m.sender_id;
          return (
            <div key={m.id} className={cn("group relative", prevSame ? "mt-0.5" : "mt-3")}>
              {!prevSame && (
                <div className="mb-1 flex items-center gap-2">
                  <Avatar name={m.sender_name} size={24} />
                  <span className="text-[12px] font-semibold text-foreground">{m.sender_name}</span>
                  <span className="text-[10px] text-muted/60">{formatTime(m.created_at)}</span>
                </div>
              )}
              <div className={cn("pl-8 text-sm leading-relaxed text-foreground", i === 0 && "border-b border-border pb-3 mb-3")}>
                {m.content && <span dangerouslySetInnerHTML={{ __html: renderRich(m.content) }} />}
                {m.edited_at && <span className="ml-1 text-[10px] text-muted/50">({t("chat.edited")})</span>}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="border-t border-border p-3">
        <div className="rounded-xl border border-border bg-bg/60 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15">
          <div className="flex items-end gap-1.5 px-2 py-1.5">
            <textarea
              ref={composerRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
              }}
              rows={1}
              placeholder={`Reply to ${parent.sender_name}…`}
              className="max-h-[160px] min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted/60"
            />
            <Button type="submit" size="icon" disabled={!val.trim() || sending} className="mb-0.5 h-8 w-8 shrink-0 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}

// ─── Huddle bar ─────────────────────────────────────────────────────────────
function HuddleBar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [active]);

  const fmt = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  if (!active) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-t border-border bg-surface-2"
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <span className="text-xs font-medium text-success">Huddle</span>
        <span className="text-[11px] font-mono text-muted">{fmt}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setMuted(!muted)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              muted ? "bg-danger/15 text-danger" : "bg-surface text-foreground hover:bg-surface-2",
            )}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            onClick={onToggle}
            className="flex h-8 items-center gap-1.5 rounded-full bg-danger/15 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/25"
          >
            <Phone className="h-3.5 w-3.5" /> Leave
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// Extract @mentions from text, matching against known peers
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

// ─── Main export ────────────────────────────────────────────────────────────
export function ChatThread({
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
}) {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selected, setSelected] = useState<string>(GROUP);
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

  // Thread panel state
  const [threadParentId, setThreadParentId] = useState<string | null>(null);

  // Huddle state
  const [huddleActive, setHuddleActive] = useState(false);

  // Hover state per message
  const [hoveredMsg, setHoveredMsg] = useState<string | null>(null);

  // Mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState({ left: 0, bottom: 0 });

  // Reactions local state (keyed by msgId → array of {emoji, count, users, reacted})
  const [reactionsMap, setReactionsMap] = useState<Record<string, { emoji: string; count: number; users: string[]; reacted: boolean }[]>>({});

  const threadKeyOf = (m: Message): string => {
    if (!m.recipient_id) return GROUP;
    return m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
  };

  // Only top-level messages in the main view (not thread replies).
  const visible = useMemo(
    () => messages.filter((m) => threadKeyOf(m) === selected && !m.parent_id),
    [messages, selected],
  );

  // Thread replies for the open thread
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

  // Date dividers
  const dateDividers = useMemo(() => {
    const seen = new Set<string>();
    const result: Record<string, string> = {};
    for (const m of visible) {
      const d = m.created_at.slice(0, 10);
      if (!seen.has(d)) {
        seen.add(d);
        result[m.id] = formatDate(m.created_at);
      }
    }
    return result;
  }, [visible]);

  // Translation
  type Lang = "en" | "de";
  const viewerLang: Lang = currentRole === "client" ? "de" : "en";
  const [langByMsg, setLangByMsg] = useState<Record<string, Lang>>({});
  const [cache, setCache] = useState<Record<string, Partial<Record<Lang, string>>>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [transErr, setTransErr] = useState<Record<string, boolean>>({});

  const versionsOf = (m: Message): Partial<Record<Lang, string>> => {
    const v: Partial<Record<Lang, string>> = {};
    if (m.content_translated && m.content_translated !== m.content && (m.translated_to === "en" || m.translated_to === "de")) {
      v[m.translated_to as Lang] = m.content_translated;
    }
    return { ...v, ...(cache[m.id] ?? {}) };
  };

  async function browserTranslate(text: string, target: Lang): Promise<string | null> {
    const chunks = text.length <= 1200 ? [text] : text.match(/[\s\S]{1,1200}/g) ?? [text];
    try {
      const parts: string[] = [];
      for (const piece of chunks) {
        const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(piece)}`).catch(() => null);
        if (!r?.ok) return null;
        const data = await r.json().catch(() => null);
        if (!Array.isArray(data?.[0])) return null;
        parts.push((data[0] as any[]).map((s) => (s && s[0]) || "").join(""));
      }
      return parts.join("").trim() || null;
    } catch {
      return null;
    }
  }

  async function ensureLang(m: Message, target: Lang) {
    if (versionsOf(m)[target]) return;
    setPending((p) => ({ ...p, [m.id]: true }));
    setTransErr((e) => (e[m.id] ? { ...e, [m.id]: false } : e));
    let translation: string | null = null;
    const res = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: m.content, target }) }).catch(() => null);
    if (res?.ok) {
      translation = (await res.json().catch(() => null))?.translation ?? null;
    } else {
      translation = await browserTranslate(m.content, target);
    }
    if (translation) {
      setCache((c) => ({ ...c, [m.id]: { ...(c[m.id] ?? {}), [target]: translation! } }));
    } else {
      setTransErr((e) => ({ ...e, [m.id]: true }));
    }
    setPending((p) => ({ ...p, [m.id]: false }));
  }

  function pickLang(m: Message, target: Lang) {
    setLangByMsg((l) => ({ ...l, [m.id]: target }));
    void ensureLang(m, target);
  }

  // Scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible]);

  useEffect(() => {
    setUnread((u) => (u[selected] ? { ...u, [selected]: 0 } : u));
  }, [selected]);

  // Load reactions for visible messages
  useEffect(() => {
    async function loadReactions() {
      const sb = createClient();
      if (!sb || !visible.length) return;
      const ids = visible.map((m) => m.id).filter((id) => !id.startsWith("temp-"));
      if (!ids.length) return;
      const { data } = await sb.from("reactions").select("*").in("message_id", ids);
      if (!data) return;
      const map: Record<string, { emoji: string; count: number; users: string[]; reacted: boolean }[]> = {};
      for (const r of data) {
        if (!map[r.message_id]) map[r.message_id] = [];
        const existing = map[r.message_id].find((x) => x.emoji === r.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(r.user_id);
          if (r.user_id === currentUserId) existing.reacted = true;
        } else {
          map[r.message_id].push({ emoji: r.emoji, count: 1, users: [r.user_id], reacted: r.user_id === currentUserId });
        }
      }
      setReactionsMap(map);
    }
    void loadReactions();
  }, [visible, currentUserId]);

  // Realtime subscription
  useEffect(() => {
    if (!clientId && !internal) return;
    const supabase = createClient();
    if (!supabase) return;
    const base = internal
      ? { schema: "public", table: "messages" }
      : { schema: "public", table: "messages", filter: `client_id=eq.${clientId}` };
    const mine = (m: any) => (internal ? m.client_id == null : m.client_id === clientId);
    const participant = (m: any) => !m.recipient_id || m.sender_id === currentUserId || m.recipient_id === currentUserId;
    const SELECT = "id,client_id,sender_id,sender_name,sender_role,recipient_id,parent_id,reply_count,last_reply_at,content,content_translated,translated_to,attachment_name,attachment_mime,attachment_size,edited_at,created_at";
    const toMsg = (m: any): Message => ({
      id: m.id,
      client_id: m.client_id,
      sender_id: m.sender_id,
      sender_name: m.sender_name ?? "TyloTech",
      sender_role: (m.sender_role ?? "team") as Role,
      recipient_id: m.recipient_id ?? null,
      parent_id: m.parent_id ?? null,
      reply_count: m.reply_count ?? 0,
      last_reply_at: m.last_reply_at ?? null,
      content: m.content ?? "",
      content_translated: m.content_translated ?? null,
      translated_to: m.translated_to ?? null,
      attachment_name: m.attachment_name ?? null,
      attachment_mime: m.attachment_mime ?? null,
      attachment_size: m.attachment_size ?? null,
      edited_at: m.edited_at ?? null,
      created_at: m.created_at,
    });
    const channel = supabase
      .channel(internal ? "messages:internal" : `messages:${clientId}`)
      .on("postgres_changes", { event: "INSERT", ...base }, (payload) => {
        const m = payload.new as any;
        if (!mine(m) || !participant(m) || seen.current.has(m.id)) return;
        seen.current.add(m.id);
        const msg = toMsg(m);
        setMessages((prev) => [...prev, msg]);
        // Update parent reply_count if it's a thread reply
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
        setCache((c) => { const n = { ...c }; delete n[m.id]; return n; });
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

  // ── Actions ───────────────────────────────────────────────────────────────

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = val.trim();
    if (!content) return;
    setVal("");
    setMentionQuery(null);
    const recipientId = selected === GROUP ? null : selected;
    const mentionIds = extractMentions(content, peers);
    const tempId = `temp-${Date.now()}`;
    seen.current.add(tempId);
    setMessages((m) => [...m, {
      id: tempId, client_id: clientId ?? "", sender_id: currentUserId, sender_name: currentName, sender_role: currentRole,
      recipient_id: recipientId, content, created_at: new Date().toISOString(),
    }]);
    const res = await fetch("/api/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, clientId, recipientId, internal, mentions: mentionIds }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        setMessages((m) => m.some((x) => x.id === message.id) ? m.filter((x) => x.id !== tempId) : m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)));
      }
    }
  }

  async function sendReply(content: string, parentId: string, mentions: string[]) {
    const recipientId = selected === GROUP ? null : selected;
    const tempId = `temp-${Date.now()}-reply`;
    seen.current.add(tempId);
    setMessages((m) => [...m, {
      id: tempId, client_id: clientId ?? "", sender_id: currentUserId, sender_name: currentName, sender_role: currentRole,
      recipient_id: recipientId, parent_id: parentId, content, created_at: new Date().toISOString(),
    }]);
    // Optimistically update parent reply count
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
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    // Optimistic update
    setReactionsMap((prev) => {
      const arr = [...(prev[messageId] ?? [])];
      const existing = arr.find((x) => x.emoji === emoji);
      if (existing?.reacted) {
        existing.count--;
        existing.users = existing.users.filter((u) => u !== currentUserId);
        existing.reacted = false;
        if (existing.count <= 0) return { ...prev, [messageId]: arr.filter((x) => x.emoji !== emoji) };
      } else if (existing) {
        existing.count++;
        existing.users.push(currentUserId);
        existing.reacted = true;
      } else {
        arr.push({ emoji, count: 1, users: [currentUserId], reacted: true });
      }
      return { ...prev, [messageId]: arr };
    });
    await fetch("/api/reactions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    }).catch(() => null);
  }

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [val]);

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void submit();
    }
  }

  function named(f: File): File {
    if (f.name) return f;
    const ext = (f.type.split("/")[1] || "png").split("+")[0];
    return new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type || "application/octet-stream" });
  }

  function stageFiles(files: File[]) {
    const staged = files.map((raw) => {
      const file = named(raw);
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      };
    });
    setPendingAtt((p) => [...p, ...staged]);
  }

  function wrapSelection(marker: string, placeholder: string) {
    const el = composerRef.current;
    const start = el?.selectionStart ?? val.length;
    const end = el?.selectionEnd ?? val.length;
    const sel = val.slice(start, end) || placeholder;
    setVal(val.slice(0, start) + marker + sel + marker + val.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + marker.length, start + marker.length + sel.length); });
  }

  function removePending(id: string) {
    setPendingAtt((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });
  }

  function onComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f);
    if (files.length) { e.preventDefault(); stageFiles(files); }
  }

  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) { e.preventDefault(); setDragOver(false); stageFiles(files); }
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
    setCache((c) => { const n = { ...c }; delete n[id]; return n; });
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, content, edited_at: new Date().toISOString() } : x)));
    const res = await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, content }) }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, ...message } : x)));
    } else if (prev) {
      setMessages((ms) => ms.map((x) => (x.id === id ? prev : x)));
      setUploadError(t("chat.editFailed"));
      setTimeout(() => setUploadError(null), 4000);
    }
  }

  async function deleteMsg(id: string) {
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    const snapshot = messages;
    setMessages((ms) => ms.filter((x) => x.id !== id));
    const res = await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setMessages(snapshot); setUploadError(t("chat.deleteFailed")); setTimeout(() => setUploadError(null), 4000); }
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

  // Mention handler
  function onComposerInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    setVal(newVal);
    // Check for @mention trigger
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
  const headerSubtitle = selected === GROUP ? subtitle ?? t("chat.groupEveryone") : activePeer?.title ?? t("chat.directMessage");

  const threads: { key: string; name: string; sub: string; icon?: boolean }[] = [
    { key: GROUP, name: title, sub: t("chat.groupThread"), icon: true },
    ...peers.map((p) => ({ key: p.id, name: p.name, sub: p.title ?? t("chat.directMessage") })),
  ];

  return (
    <div className={cn("flex h-full overflow-hidden rounded-2xl border border-border bg-bg", className)}>
      {/* ── Channel rail ─────────────────────────────────────────────── */}
      {peers.length > 0 && (
        <div className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/50">
          <div className="border-b border-border px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("chat.conversations")}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {threads.map((th) => {
              const last = lastByThread[th.key];
              const isActive = selected === th.key;
              const count = unread[th.key] ?? 0;
              return (
                <button
                  key={th.key}
                  onClick={() => { setSelected(th.key); setThreadParentId(null); }}
                  className={cn(
                    "mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all",
                    isActive ? "bg-brand/10 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {th.icon ? (
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", isActive ? "bg-brand/20 text-brand" : "bg-surface-2 text-muted")}>
                      {th.key === GROUP ? <Hash className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    </span>
                  ) : (
                    <span className="relative">
                      <Avatar name={th.name} size={32} />
                      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className={cn("truncate text-[13px]", isActive ? "font-semibold" : "font-medium")}>{th.name}</span>
                      {count > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">{count > 9 ? "9+" : count}</span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-muted/70">
                      {last ? last.content?.slice(0, 40) || (last.attachment_name ? `📎 ${last.attachment_name}` : th.sub) : th.sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main chat area ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            {selected === GROUP ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
                <Hash className="h-[18px] w-[18px]" />
              </span>
            ) : (
              <span className="relative">
                <Avatar name={headerTitle} size={36} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{headerTitle}</p>
              <p className="text-[11px] text-muted">{headerSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHuddleActive(!huddleActive)}
              title="Start a huddle"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                huddleActive ? "bg-success/15 text-success" : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Headphones className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Huddle bar */}
        <AnimatePresence>
          {huddleActive && <HuddleBar active={huddleActive} onToggle={() => setHuddleActive(false)} />}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {visible.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
                    <Hash className="h-7 w-7 text-brand" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{t("chat.noMessages")}</p>
                  <p className="mt-1 text-xs text-muted">{selected === GROUP ? t("chat.sayHello") : t("chat.startPrivate", { name: headerTitle })}</p>
                </div>
              )}
              {visible.map((m, idx) => {
                const mine = m.sender_id === currentUserId;
                const prevMsg = idx > 0 ? visible[idx - 1] : null;
                const sameSender = prevMsg?.sender_id === m.sender_id && !dateDividers[m.id];
                const withinWindow = prevMsg && new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 300000;
                const grouped = sameSender && withinWindow;
                const selectedLang: Lang = langByMsg[m.id] ?? viewerLang;
                const versions = versionsOf(m);
                const displayText = versions[selectedLang] ?? m.content;
                const isTranslated = versions[selectedLang] != null && versions[selectedLang] !== m.content;
                const loading = pending[m.id] && versions[selectedLang] == null;
                const hasText = !!(displayText && displayText.trim());
                const mime = m.attachment_mime || "";
                const hasAttachment = !!mime;
                const isTemp = m.id.startsWith("temp-");
                const attUrl = `/api/messages/attachment?id=${m.id}`;
                const msgReactions = reactionsMap[m.id] ?? [];
                const divider = dateDividers[m.id];
                const replyCount = m.reply_count ?? 0;

                return (
                  <div key={m.id}>
                    {/* Date divider */}
                    {divider && (
                      <div className="my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted">{divider}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}

                    <div
                      className={cn("group relative rounded-lg px-3 py-0.5 transition-colors hover:bg-surface-2/50", grouped ? "mt-0" : "mt-3")}
                      onMouseEnter={() => setHoveredMsg(m.id)}
                      onMouseLeave={() => setHoveredMsg(null)}
                    >
                      {/* Hover actions */}
                      <AnimatePresence>
                        {hoveredMsg === m.id && !isTemp && editingId !== m.id && (
                          <HoverActions
                            mine={mine}
                            onReply={() => setThreadParentId(m.id)}
                            onReact={(emoji) => toggleReaction(m.id, emoji)}
                            onEdit={mine && hasText ? () => startEdit(m) : undefined}
                            onDelete={mine ? () => deleteMsg(m.id) : undefined}
                            hasText={hasText}
                          />
                        )}
                      </AnimatePresence>

                      {!grouped ? (
                        <div className="flex gap-2.5">
                          <Avatar name={m.sender_name} size={36} className="mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[13px] font-semibold text-foreground">{m.sender_name}</span>
                              <span
                                className={cn(
                                  "rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                  m.sender_role === "client" ? "bg-info/15 text-info" : "bg-brand/15 text-brand",
                                )}
                              >
                                {m.sender_role === "client" ? t("chat.roleClient") : t("chat.roleTeam")}
                              </span>
                              <span className="text-[11px] text-muted/50">{formatTime(m.created_at)}</span>
                              {m.edited_at && <span className="text-[10px] italic text-muted/40">({t("chat.edited")})</span>}
                            </div>

                            {/* Attachment */}
                            {hasAttachment && renderAttachment(m, isTemp, attUrl, mine)}

                            {/* Edit mode */}
                            {editingId === m.id ? (
                              <div className="mt-1 flex flex-col gap-1.5">
                                <textarea
                                  autoFocus
                                  value={editVal}
                                  onChange={(e) => setEditVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m.id); }
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  rows={Math.min(10, Math.max(2, editVal.split("\n").length))}
                                  className="w-full resize-y rounded-lg border border-brand/50 bg-bg/60 px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-brand/15"
                                />
                                <div className="flex items-center gap-2">
                                  <button onClick={() => saveEdit(m.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90">
                                    <Check className="h-3.5 w-3.5" /> {t("chat.save")}
                                  </button>
                                  <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground">
                                    <X className="h-3.5 w-3.5" /> {t("chat.cancel")}
                                  </button>
                                  <span className="text-[10px] text-muted/50">⌘/Ctrl + ↵</span>
                                </div>
                              </div>
                            ) : hasText ? (
                              <div className="mt-0.5 text-[14px] leading-relaxed text-foreground">
                                {loading ? <span className="text-muted">…</span> : <span dangerouslySetInnerHTML={{ __html: renderRich(displayText) }} />}
                              </div>
                            ) : null}

                            {/* Translation toggle + reactions + thread */}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {hasText && (
                                <span className="inline-flex overflow-hidden rounded-full border border-border">
                                  {(["en", "de"] as const).map((l) => (
                                    <button key={l} onClick={() => pickLang(m, l)} className={cn("px-1.5 py-0.5 text-[9px] font-semibold uppercase transition-colors", selectedLang === l ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground")}>
                                      {l}
                                    </button>
                                  ))}
                                </span>
                              )}
                              {isTranslated && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-brand">
                                  <Languages className="h-2.5 w-2.5" /> {selectedLang === "de" ? "Übersetzt" : "Translated"}
                                </span>
                              )}
                              {transErr[m.id] && !isTranslated && !loading && (
                                <span className="text-[10px] text-warning/80">{t("chat.translateUnavailable")}</span>
                              )}
                              {/* Reactions */}
                              {msgReactions.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {msgReactions.map((r) => (
                                    <button
                                      key={r.emoji}
                                      onClick={() => toggleReaction(m.id, r.emoji)}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                                        r.reacted ? "border-brand/40 bg-brand/10 text-foreground" : "border-border bg-surface hover:bg-surface-2",
                                      )}
                                    >
                                      <span>{r.emoji}</span>
                                      <span className="text-[10px] font-medium">{r.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Thread reply count */}
                              {replyCount > 0 && (
                                <button
                                  onClick={() => setThreadParentId(m.id)}
                                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-brand transition-colors hover:bg-brand/10"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  {replyCount} {replyCount === 1 ? "reply" : "replies"}
                                  {m.last_reply_at && (
                                    <span className="text-[10px] text-muted"> · {formatRelativeTime(m.last_reply_at)}</span>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Grouped (same sender, within 5 min) — just the content, no avatar */
                        <div className="pl-[46px]">
                          <span className="invisible absolute left-3 top-1.5 text-[10px] text-muted/40 group-hover:visible">{formatTime(m.created_at)}</span>

                          {hasAttachment && renderAttachment(m, isTemp, attUrl, mine)}

                          {editingId === m.id ? (
                            <div className="flex flex-col gap-1.5">
                              <textarea autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(m.id); } if (e.key === "Escape") setEditingId(null); }}
                                rows={Math.min(10, Math.max(2, editVal.split("\n").length))}
                                className="w-full resize-y rounded-lg border border-brand/50 bg-bg/60 px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-brand/15"
                              />
                              <div className="flex items-center gap-2">
                                <button onClick={() => saveEdit(m.id)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground"><Check className="h-3.5 w-3.5" /> {t("chat.save")}</button>
                                <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"><X className="h-3.5 w-3.5" /> {t("chat.cancel")}</button>
                              </div>
                            </div>
                          ) : hasText ? (
                            <div className="text-[14px] leading-relaxed text-foreground">
                              {loading ? <span className="text-muted">…</span> : <span dangerouslySetInnerHTML={{ __html: renderRich(displayText) }} />}
                            </div>
                          ) : null}

                          {/* Reactions + thread for grouped messages */}
                          {(msgReactions.length > 0 || replyCount > 0) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {msgReactions.map((r) => (
                                <button key={r.emoji} onClick={() => toggleReaction(m.id, r.emoji)}
                                  className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                                    r.reacted ? "border-brand/40 bg-brand/10 text-foreground" : "border-border bg-surface hover:bg-surface-2")}>
                                  <span>{r.emoji}</span><span className="text-[10px] font-medium">{r.count}</span>
                                </button>
                              ))}
                              {replyCount > 0 && (
                                <button onClick={() => setThreadParentId(m.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand/10">
                                  <MessageCircle className="h-3.5 w-3.5" /> {replyCount} {replyCount === 1 ? "reply" : "replies"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Composer */}
            {uploadError && <p className="border-t border-border px-4 pt-2 text-xs text-danger">{uploadError}</p>}
            <form
              onSubmit={submit}
              onDrop={onDrop}
              onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
              onDragLeave={() => setDragOver(false)}
              className="relative border-t border-border px-4 py-3"
            >
              <input ref={fileRef} type="file" multiple className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt"
                onChange={(e) => { stageFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
              {/* Mention autocomplete */}
              <AnimatePresence>
                {mentionQuery !== null && peers.length > 0 && (
                  <MentionPopup peers={peers} query={mentionQuery} onSelect={insertMention} position={mentionPos} />
                )}
              </AnimatePresence>

              <div className={cn("rounded-xl border bg-bg/60 transition-colors", dragOver ? "border-brand bg-brand/[0.06]" : "border-border focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15")}>
                {/* Pending attachments */}
                {pendingAtt.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-b border-border/60 p-2">
                    {pendingAtt.map((a) => (
                      <div key={a.id} className="group relative">
                        {a.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt={a.file.name} className="h-16 w-16 rounded-lg border border-border object-cover" />
                        ) : (
                          <div className="flex h-16 w-28 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2">
                            <FileText className="h-5 w-5 shrink-0 text-brand" />
                            <span className="min-w-0"><span className="block truncate text-[11px] font-medium">{a.file.name}</span><span className="block text-[10px] text-muted">{formatBytes(a.file.size)}</span></span>
                          </div>
                        )}
                        <button type="button" onClick={() => removePending(a.id)} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow ring-2 ring-bg"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Toolbar */}
                <div className="flex items-center gap-0.5 border-b border-border/40 px-2 py-1">
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection("**", "text")} title={t("chat.bold")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"><Bold className="h-3.5 w-3.5" /></button>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection("==", "highlight")} title={t("chat.highlight")} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"><Highlighter className="h-3.5 w-3.5" /></button>
                  <div className="mx-1 h-4 w-px bg-border" />
                  <button type="button" onClick={() => { const el = composerRef.current; if (el) { const p = el.selectionStart ?? val.length; setVal(val.slice(0, p) + "@" + val.slice(p)); requestAnimationFrame(() => { el.focus(); el.setSelectionRange(p + 1, p + 1); }); setMentionQuery(""); } }} title="Mention someone" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"><AtSign className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-end gap-1.5 px-2 py-1.5">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title={t("chat.attach")} className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50">
                    {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" />}
                  </button>
                  <textarea
                    ref={composerRef}
                    value={val}
                    onChange={onComposerInput}
                    onKeyDown={onComposerKeyDown}
                    onPaste={onComposerPaste}
                    rows={1}
                    placeholder={dragOver ? t("chat.dropHere") : pendingAtt.length ? t("chat.captionPlaceholder") : selected === GROUP ? t("chat.messageTeam") : t("chat.messagePerson", { name: headerTitle })}
                    className="max-h-[200px] min-h-[36px] flex-1 resize-none self-center bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted/60"
                  />
                  <Button type="submit" size="icon" disabled={!val.trim() && !pendingAtt.length} className="mb-0.5 h-9 w-9 shrink-0 disabled:opacity-40">
                    <Send className="h-[18px] w-[18px]" />
                  </Button>
                </div>
              </div>
              <p className="mt-1 px-1 text-[10px] text-muted/40">{t("chat.composerHint")} · @ to mention</p>
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
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Attachment renderer ────────────────────────────────────────────────────
function renderAttachment(m: Message, isTemp: boolean, attUrl: string, mine: boolean) {
  const mime = m.attachment_mime || "";
  return (
    <div className="mt-1 mb-1">
      {isTemp ? (
        <div className="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="max-w-[200px] truncate">{m.attachment_name}</span>
        </div>
      ) : mime.startsWith("image/") ? (
        <a href={attUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={attUrl} alt={m.attachment_name ?? "image"} className="max-h-72 max-w-sm rounded-xl border border-border object-cover transition-opacity hover:opacity-90" />
        </a>
      ) : mime.startsWith("video/") ? (
        <video src={attUrl} controls className="max-h-72 max-w-sm rounded-xl border border-border" />
      ) : mime.startsWith("audio/") ? (
        <audio src={attUrl} controls className="w-64 max-w-full" />
      ) : (
        <a href={attUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm transition-colors hover:border-brand/40">
          <FileText className="h-5 w-5 shrink-0 text-brand" />
          <span className="min-w-0">
            <span className="block max-w-[200px] truncate font-medium text-foreground">{m.attachment_name}</span>
            {m.attachment_size ? <span className="block text-[10px] text-muted">{formatBytes(m.attachment_size)}</span> : null}
          </span>
          <Download className="h-4 w-4 shrink-0 text-muted" />
        </a>
      )}
    </div>
  );
}
