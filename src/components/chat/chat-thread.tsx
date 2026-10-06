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
} from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { ChatPeer, Message, Role } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

const GROUP = "group";

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

function formatDate(iso: string, t: (k: string) => string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && d.getDate() === now.getDate()) return t("chat.today");
    if (diff < 172800000) return t("chat.yesterday");
    return d.toLocaleDateString("de-DE", { weekday: "long", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function renderRich(text: string): string {
  const esc = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  return esc
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=\n]+)==/g, '<mark style="background:rgba(201,168,76,.38);color:inherit;border-radius:3px;padding:0 2px">$1</mark>')
    .replace(/@([A-Za-zÀ-ÿ][\w\s]{0,30}[\w])/g, '<span class="text-brand font-semibold">@$1</span>');
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
          <Avatar name={p.name} size={24} />
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
}: {
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
      className="flex w-[340px] shrink-0 flex-col border-l border-border bg-bg"
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
                  <Avatar name={m.sender_name} size={24} />
                  <span className="text-[12px] font-semibold text-foreground">{m.sender_name}</span>
                  <span className="text-[10px] text-muted/60">{formatTime(m.created_at)}</span>
                </div>
              )}
              <div className={cn("pl-8 text-sm leading-relaxed text-foreground", i === 0 && "border-b border-border pb-3 mb-3")}>
                {m.content && <span dangerouslySetInnerHTML={{ __html: renderRich(m.content) }} />}
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
              placeholder={`${t("chat.reply")}…`}
              className="max-h-[160px] min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted/60"
            />
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
    const SELECT = "id,client_id,sender_id,sender_name,sender_role,recipient_id,parent_id,reply_count,last_reply_at,content,content_translated,translated_to,attachment_name,attachment_mime,attachment_size,edited_at,created_at";
    const toMsg = (m: any): Message => ({
      id: m.id, client_id: m.client_id, sender_id: m.sender_id, sender_name: m.sender_name ?? "TyloTech",
      sender_role: (m.sender_role ?? "team") as Role, recipient_id: m.recipient_id ?? null,
      parent_id: m.parent_id ?? null, reply_count: m.reply_count ?? 0, last_reply_at: m.last_reply_at ?? null,
      content: m.content ?? "", content_translated: m.content_translated ?? null, translated_to: m.translated_to ?? null,
      attachment_name: m.attachment_name ?? null, attachment_mime: m.attachment_mime ?? null,
      attachment_size: m.attachment_size ?? null, edited_at: m.edited_at ?? null, created_at: m.created_at,
    });
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
      return;
    }
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

  function onComposerInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    setVal(newVal);
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

  const channelList: { key: string; name: string; sub: string; isGroup?: boolean }[] = [
    { key: GROUP, name: title, sub: internal ? t("chat.groupIntern") : t("chat.groupEveryone"), isGroup: true },
    ...peers.map((p) => ({ key: p.id, name: p.name, sub: p.title ?? p.role })),
  ];

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-bg", className)}>
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
                    <div className="relative flex shrink-0">
                      <Avatar name="A" size={32} className="ring-2 ring-surface" />
                      <Avatar name="B" size={32} className="-ml-2 ring-2 ring-surface" />
                    </div>
                  ) : (
                    <Avatar name={ch.name} size={36} />
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
                      <Avatar name={m.sender_name} size={18} className="ring-1 ring-surface" />
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
                  <Avatar name={m.sender_name} size={36} />
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
                  <div className="relative flex shrink-0">
                    {peers.slice(0, 3).map((p, i) => (
                      <Avatar key={p.id} name={p.name} size={32} className={cn("ring-2 ring-bg", i > 0 && "-ml-2")} />
                    ))}
                  </div>
                ) : (
                  <Avatar name={headerTitle} size={36} />
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
                              icon={<Avatar name={ch.name} size={18} />}
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
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
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
                    {divider && (
                      <div className="my-5 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[12px] font-medium text-muted">{divider}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}

                    <div
                      className={cn("group relative", grouped ? "mt-0.5" : "mt-5")}
                      onMouseEnter={() => setHoveredMsg(m.id)}
                      onMouseLeave={() => setHoveredMsg(null)}
                    >
                      {/* Hover actions */}
                      {hoveredMsg === m.id && !isTemp && editingId !== m.id && (
                        <div className={cn("absolute -top-3 z-30 flex items-center gap-0.5 rounded-lg border border-border bg-surface px-1 py-0.5 shadow-sm", mine ? "right-0" : "left-10")}>
                          <button onClick={() => setThreadParentId(m.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                          {mine && hasText && (
                            <button onClick={() => startEdit(m)} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-foreground">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {mine && (
                            <button onClick={() => deleteMsg(m.id)} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-danger">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {!grouped ? (
                        <div className="flex gap-3">
                          <Avatar name={m.sender_name} size={36} className="mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-foreground">{m.sender_name}</span>
                              <span className="text-[11px] text-muted">{formatTime(m.created_at)}</span>
                            </div>

                            {hasAttachment && renderAttachment(m, isTemp, attUrl)}

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
                                <span dangerouslySetInnerHTML={{ __html: renderRich(m.content) }} />
                                {m.edited_at && <span className="ml-1 text-[10px] text-muted/40">({t("chat.edited")})</span>}
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
                          </div>
                        </div>
                      ) : (
                        <div className="pl-[48px]">
                          <span className="invisible absolute left-3 top-1.5 text-[10px] text-muted/40 group-hover:visible">{formatTime(m.created_at)}</span>
                          {hasAttachment && renderAttachment(m, isTemp, attUrl)}
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
                              <span dangerouslySetInnerHTML={{ __html: renderRich(m.content) }} />
                              {m.edited_at && <span className="ml-1 text-[10px] text-muted/40">({t("chat.edited")})</span>}
                            </div>
                          ) : null}
                          {replyCount > 0 && (
                            <button onClick={() => setThreadParentId(m.id)} className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:underline">
                              <MessageCircle className="h-3.5 w-3.5" /> {replyCount} {t("chat.replies")}
                            </button>
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

              <div className={cn("rounded-2xl border bg-bg transition-colors", dragOver ? "border-brand bg-brand/[0.04]" : "border-border focus-within:border-brand/40")}>
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
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function renderAttachment(m: Message, isTemp: boolean, attUrl: string) {
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
            {m.attachment_size ? <span className="block text-[10px] text-muted">{mime.split("/")[0].toUpperCase()} · {formatBytes(m.attachment_size)}</span> : null}
          </span>
        </a>
      )}
    </div>
  );
}
