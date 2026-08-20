"use client";

import { motion } from "framer-motion";
import { Check, Download, FileText, Languages, Loader2, Paperclip, Pencil, Send, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  /** People this user can open a 1:1 thread with. Empty = group-only. */
  peers?: ChatPeer[];
  title: string;
  subtitle?: string;
  className?: string;
  /** Staff-only internal workspace (client_id null). */
  internal?: boolean;
}) {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selected, setSelected] = useState<string>(GROUP); // GROUP | peerId
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
  // Attachments staged in the composer (preview + optional caption) before sending.
  const [pendingAtt, setPendingAtt] = useState<{ id: string; file: File; url: string | null }[]>([]);
  const seen = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Which thread a message belongs to, from THIS user's perspective.
  const threadKeyOf = (m: Message): string => {
    if (!m.recipient_id) return GROUP;
    return m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
  };

  const visible = useMemo(
    () => messages.filter((m) => threadKeyOf(m) === selected),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, selected],
  );

  // Last message preview per thread, for the rail.
  const lastByThread = useMemo(() => {
    const map: Record<string, Message> = {};
    for (const m of messages) map[threadKeyOf(m)] = m; // messages are time-ordered
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Per-message chosen language + on-demand translation cache.
  type Lang = "en" | "de";
  const viewerLang: Lang = currentRole === "client" ? "de" : "en";
  const [langByMsg, setLangByMsg] = useState<Record<string, Lang>>({});
  const [cache, setCache] = useState<Record<string, Partial<Record<Lang, string>>>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [transErr, setTransErr] = useState<Record<string, boolean>>({});

  // Known translations only — never assume the original's language from the
  // sender role (a team member may well write in German). A stored translation
  // is only trusted when it actually DIFFERS from the original: the send-time
  // auto-translate targets a language by role, so a German message from the team
  // gets a no-op "de→de" translation equal to the original — trusting that would
  // wrongly short-circuit ensureLang and show German under the EN tab forever.
  // Anything not known is fetched on demand from `content`, the safe fallback.
  const versionsOf = (m: Message): Partial<Record<Lang, string>> => {
    const v: Partial<Record<Lang, string>> = {};
    if (
      m.content_translated &&
      m.content_translated !== m.content &&
      (m.translated_to === "en" || m.translated_to === "de")
    ) {
      v[m.translated_to as Lang] = m.content_translated;
    }
    return { ...v, ...(cache[m.id] ?? {}) };
  };

  async function ensureLang(m: Message, target: Lang) {
    if (versionsOf(m)[target]) return;
    setPending((p) => ({ ...p, [m.id]: true }));
    setTransErr((e) => (e[m.id] ? { ...e, [m.id]: false } : e));
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: m.content, target }),
    }).catch(() => null);
    if (res?.ok) {
      const { translation } = await res.json();
      setCache((c) => ({ ...c, [m.id]: { ...(c[m.id] ?? {}), [target]: translation } }));
    } else {
      // Service unavailable (e.g. no API credits) — surface it instead of silently
      // leaving the original text under a highlighted target-language tab.
      setTransErr((e) => ({ ...e, [m.id]: true }));
    }
    setPending((p) => ({ ...p, [m.id]: false }));
  }

  function pickLang(m: Message, target: Lang) {
    setLangByMsg((l) => ({ ...l, [m.id]: target }));
    void ensureLang(m, target);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible]);

  // Clear unread when opening a thread.
  useEffect(() => {
    setUnread((u) => (u[selected] ? { ...u, [selected]: 0 } : u));
  }, [selected]);

  useEffect(() => {
    if (!clientId && !internal) return;
    const supabase = createClient();
    if (!supabase) return;
    const base = internal
      ? { schema: "public", table: "messages" }
      : { schema: "public", table: "messages", filter: `client_id=eq.${clientId}` };
    const mine = (m: any) => (internal ? m.client_id == null : m.client_id === clientId);
    // Defense-in-depth: even if Realtime RLS were ever misconfigured, never surface
    // a direct message the current user is neither the sender nor recipient of.
    const participant = (m: any) =>
      !m.recipient_id || m.sender_id === currentUserId || m.recipient_id === currentUserId;
    const SELECT =
      "id,client_id,sender_id,sender_name,sender_role,recipient_id,content,content_translated,translated_to,attachment_name,attachment_mime,attachment_size,edited_at,created_at";
    const toMsg = (m: any): Message => ({
      id: m.id,
      client_id: m.client_id,
      sender_id: m.sender_id,
      sender_name: m.sender_name ?? "TyloTech",
      sender_role: (m.sender_role ?? "team") as Role,
      recipient_id: m.recipient_id ?? null,
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
        const key = !msg.recipient_id ? GROUP : msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
        if (msg.sender_id !== currentUserId && key !== selectedRef.current) {
          setUnread((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }));
        }
      })
      .on("postgres_changes", { event: "UPDATE", ...base }, (payload) => {
        const m = payload.new as any;
        if (!mine(m)) return;
        // Drop any cached translation of the old text so the edit re-renders.
        setCache((c) => { const n = { ...c }; delete n[m.id]; return n; });
        setMessages((prev) => prev.map((x) => (x.id === m.id ? toMsg(m) : x)));
      })
      .on("postgres_changes", { event: "DELETE", ...base }, (payload) => {
        const oldId = (payload.old as any)?.id;
        if (oldId) setMessages((prev) => prev.filter((x) => x.id !== oldId));
      })
      .subscribe((status) => {
        // On (re)connect, pull anything inserted while the socket was down —
        // postgres_changes only delivers events for a live connection, so without
        // this a message sent during a brief drop would vanish until a reload.
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, currentUserId, internal]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = val.trim();
    if (!content) return;
    setVal("");
    const recipientId = selected === GROUP ? null : selected;
    const tempId = `temp-${Date.now()}`;
    seen.current.add(tempId);
    setMessages((m) => [
      ...m,
      {
        id: tempId,
        client_id: clientId ?? "",
        sender_id: currentUserId,
        sender_name: currentName,
        sender_role: currentRole,
        recipient_id: recipientId,
        content,
        created_at: new Date().toISOString(),
      },
    ]);

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, clientId, recipientId, internal }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        // If realtime already delivered the real row, drop the temp instead of duplicating.
        setMessages((m) =>
          m.some((x) => x.id === message.id) ? m.filter((x) => x.id !== tempId) : m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)),
        );
      }
    }
  }

  // Auto-grow the composer to fit its content (up to a cap, then it scrolls).
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [val]);

  // Enter sends; Shift+Enter (or ⌘/Ctrl+Enter) inserts a newline.
  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void submit();
    }
  }

  // Give a clipboard/dropped blob a real filename so the upload names it sensibly.
  function named(f: File): File {
    if (f.name) return f;
    const ext = (f.type.split("/")[1] || "png").split("+")[0];
    return new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type || "application/octet-stream" });
  }

  // Stage files in the composer as previews (with the textarea as an optional
  // caption). Nothing uploads until the user hits send.
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

  function removePending(id: string) {
    setPendingAtt((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });
  }

  // Paste images/files straight into the chat (like Claude): stage as previews.
  function onComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) {
      e.preventDefault();
      stageFiles(files);
    }
  }

  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) {
      e.preventDefault();
      setDragOver(false);
      stageFiles(files);
    }
  }

  // Send: upload every staged attachment (caption rides on the first), then any
  // remaining text as its own message. Falls back to a plain text send.
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

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditVal(m.content);
  }

  async function saveEdit(id: string) {
    const content = editVal.trim();
    if (!content) return;
    const prev = messages.find((x) => x.id === id); // snapshot for rollback
    setEditingId(null);
    setCache((c) => { const n = { ...c }; delete n[id]; return n; }); // stale translation
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, content, edited_at: new Date().toISOString() } : x)));
    const res = await fetch("/api/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, ...message } : x)));
    } else if (prev) {
      setMessages((ms) => ms.map((x) => (x.id === id ? prev : x))); // rollback
      setUploadError(t("chat.editFailed"));
      setTimeout(() => setUploadError(null), 4000);
    }
  }

  async function deleteMsg(id: string) {
    if (!window.confirm(t("chat.deleteConfirm"))) return;
    const snapshot = messages; // for rollback
    setMessages((ms) => ms.filter((x) => x.id !== id));
    const res = await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setMessages(snapshot); // restore on failure
      setUploadError(t("chat.deleteFailed"));
      setTimeout(() => setUploadError(null), 4000);
    }
  }

  async function uploadFile(file: File, caption?: string) {
    if (!file) return;
    const recipientId = selected === GROUP ? null : selected;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    seen.current.add(tempId);
    // Optimistic placeholder while uploading.
    setMessages((m) => [
      ...m,
      {
        id: tempId,
        client_id: clientId ?? "",
        sender_id: currentUserId,
        sender_name: currentName,
        sender_role: currentRole,
        recipient_id: recipientId,
        content: caption?.trim() || "",
        attachment_name: file.name,
        attachment_mime: file.type || "application/octet-stream",
        attachment_size: file.size,
        created_at: new Date().toISOString(),
      },
    ]);
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
        setMessages((m) =>
          m.some((x) => x.id === message.id) ? m.filter((x) => x.id !== tempId) : m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)),
        );
      }
    } else {
      // Roll back the optimistic bubble on failure.
      setMessages((m) => m.filter((x) => x.id !== tempId));
      const err = res ? (await res.json().catch(() => null))?.error : null;
      setUploadError(err || "Upload failed.");
      setTimeout(() => setUploadError(null), 4000);
    }
  }

  const activePeer = peers.find((p) => p.id === selected);
  const headerTitle = selected === GROUP ? title : activePeer?.name ?? title;
  const headerSubtitle =
    selected === GROUP ? subtitle ?? t("chat.groupEveryone") : activePeer?.title ?? t("chat.directMessage");

  const threads: { key: string; name: string; sub: string; icon?: boolean }[] = [
    { key: GROUP, name: title, sub: t("chat.groupThread"), icon: true },
    ...peers.map((p) => ({ key: p.id, name: p.name, sub: p.title ?? t("chat.directMessage") })),
  ];

  return (
    <Card className={cn("flex h-[560px] p-0", className)}>
      {/* ---- Thread rail (only when there are people to DM) ---- */}
      {peers.length > 0 && (
        <div className="flex w-56 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("chat.conversations")}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {threads.map((t) => {
              const last = lastByThread[t.key];
              const isActive = selected === t.key;
              const count = unread[t.key] ?? 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setSelected(t.key)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                    isActive ? "bg-brand/10 ring-1 ring-brand/25" : "hover:bg-surface-2",
                  )}
                >
                  {t.icon ? (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                      <Users className="h-4 w-4" />
                    </span>
                  ) : (
                    <Avatar name={t.name} size={36} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                      {count > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
                          {count > 9 ? "9+" : count}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {last ? last.content || (last.attachment_name ? `📎 ${last.attachment_name}` : t.sub) : t.sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Active thread ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <span className="relative">
            {selected === GROUP ? (
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand/15 text-brand">
                <Users className="h-[18px] w-[18px]" />
              </span>
            ) : (
              <Avatar name={headerTitle} size={38} />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-surface" />
          </span>
          <div>
            <p className="text-sm font-semibold">{headerTitle}</p>
            <p className="text-[11px] text-success">{headerSubtitle}</p>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {visible.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted">
              <p>{t("chat.noMessages")}</p>
              <p className="text-xs text-muted/70">
                {selected === GROUP ? t("chat.sayHello") : t("chat.startPrivate", { name: headerTitle })}
              </p>
            </div>
          )}
          {visible.map((m) => {
            const mine = m.sender_id === currentUserId;
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
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-2.5", mine && "flex-row-reverse")}
              >
                {!mine && <Avatar name={m.sender_name} size={32} className="mt-1" />}
                <div className={cn("max-w-[72%]", mine && "items-end text-right")}>
                  {!mine && <p className="mb-1 text-[11px] font-medium text-muted">{m.sender_name}</p>}

                  {hasAttachment && (
                    <div className={cn("mb-1", hasText && "mb-2")}>
                      {isTemp ? (
                        <div className="inline-flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="max-w-[200px] truncate">{m.attachment_name}</span>
                        </div>
                      ) : mime.startsWith("image/") ? (
                        <a href={attUrl} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={attUrl} alt={m.attachment_name ?? "image"} className="max-h-64 max-w-full rounded-2xl border border-border object-cover" />
                        </a>
                      ) : mime.startsWith("video/") ? (
                        <video src={attUrl} controls className="max-h-64 max-w-full rounded-2xl border border-border" />
                      ) : mime.startsWith("audio/") ? (
                        <audio src={attUrl} controls className="w-64 max-w-full" />
                      ) : (
                        <a
                          href={attUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "inline-flex items-center gap-2.5 rounded-2xl border border-border px-3.5 py-2.5 text-sm transition-colors hover:border-brand/40",
                            mine ? "bg-brand/10" : "bg-surface-2",
                          )}
                        >
                          <FileText className="h-5 w-5 shrink-0 text-brand" />
                          <span className="min-w-0">
                            <span className="block max-w-[200px] truncate font-medium text-foreground">{m.attachment_name}</span>
                            {m.attachment_size ? <span className="block text-[10px] text-muted">{formatBytes(m.attachment_size)}</span> : null}
                          </span>
                          <Download className="h-4 w-4 shrink-0 text-muted" />
                        </a>
                      )}
                    </div>
                  )}

                  {editingId === m.id ? (
                    <div className={cn("flex flex-col gap-1.5", mine && "items-end")}>
                      <textarea
                        autoFocus
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit(m.id);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        rows={Math.min(14, Math.max(2, editVal.split("\n").length))}
                        className="w-[20rem] max-w-[75vw] resize-y rounded-xl border border-brand/50 bg-bg/60 px-3 py-2 text-left text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-brand/15 sm:w-[26rem]"
                      />
                      <div className={cn("flex items-center gap-2", mine && "flex-row-reverse")}>
                        <button
                          onClick={() => saveEdit(m.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90"
                        >
                          <Check className="h-3.5 w-3.5" /> {t("chat.save")}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" /> {t("chat.cancel")}
                        </button>
                        <span className="text-[10px] text-muted/50">⌘/Ctrl + ↵</span>
                      </div>
                    </div>
                  ) : hasText ? (
                    <div
                      title={isTranslated ? `Original: ${m.content}` : undefined}
                      className={cn(
                        "inline-block rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        mine ? "rounded-br-md bg-brand text-brand-foreground" : "rounded-bl-md bg-surface-2 text-foreground",
                      )}
                    >
                      {loading ? <span className="opacity-60">…</span> : displayText}
                    </div>
                  ) : null}
                  <div className={cn("mt-1 flex items-center gap-2 text-[10px] text-muted/60", mine && "flex-row-reverse")}>
                    {hasText && (
                      <span className="inline-flex overflow-hidden rounded-full border border-border">
                        {(["en", "de"] as const).map((l) => (
                          <button
                            key={l}
                            onClick={() => pickLang(m, l)}
                            title={l === "en" ? "English" : "Deutsch"}
                            className={cn(
                              "px-1.5 py-0.5 text-[9px] font-semibold uppercase transition-colors",
                              selectedLang === l ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
                            )}
                          >
                            {l}
                          </button>
                        ))}
                      </span>
                    )}
                    {hasText && isTranslated && (
                      <span className="inline-flex items-center gap-1 text-brand">
                        <Languages className="h-2.5 w-2.5" />
                        {selectedLang === "de" ? "Übersetzt" : "Translated"}
                      </span>
                    )}
                    {hasText && transErr[m.id] && !isTranslated && !loading && (
                      <span className="text-warning/80" title={t("chat.translateUnavailable")}>
                        {t("chat.translateUnavailable")}
                      </span>
                    )}
                    <span>{formatRelativeTime(m.created_at)}</span>
                    {m.edited_at && <span className="italic">· {t("chat.edited")}</span>}
                    {mine && !isTemp && editingId !== m.id && (
                      <span className="inline-flex items-center gap-1.5">
                        {hasText && (
                          <button onClick={() => startEdit(m)} title={t("chat.edit")} className="hover:text-foreground">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        <button onClick={() => deleteMsg(m.id)} title={t("chat.delete")} className="hover:text-danger">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div ref={endRef} />
        </div>

        {uploadError && (
          <p className="border-t border-border px-4 pt-2 text-xs text-danger">{uploadError}</p>
        )}
        <form
          onSubmit={submit}
          onDrop={onDrop}
          onDragOver={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          className="border-t border-border p-3"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt"
            onChange={(e) => {
              stageFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <div
            className={cn(
              "rounded-2xl border bg-bg/60 transition-colors",
              dragOver ? "border-brand bg-brand/[0.06]" : "border-border focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15",
            )}
          >
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
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-medium text-foreground">{a.file.name}</span>
                          <span className="block text-[10px] text-muted">{formatBytes(a.file.size)}</span>
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removePending(a.id)}
                      aria-label={t("chat.remove")}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow ring-2 ring-bg transition-transform hover:scale-105"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5 px-2 py-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title={t("chat.attach")}
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" />}
              </button>
              <textarea
                ref={composerRef}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={onComposerKeyDown}
                onPaste={onComposerPaste}
                rows={1}
                placeholder={
                  dragOver
                    ? t("chat.dropHere")
                    : pendingAtt.length
                      ? t("chat.captionPlaceholder")
                      : selected === GROUP
                        ? t("chat.messageTeam")
                        : t("chat.messagePerson", { name: headerTitle })
                }
                className="max-h-[200px] min-h-[36px] flex-1 resize-none self-center bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-muted/60"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!val.trim() && !pendingAtt.length}
                className="mb-0.5 h-9 w-9 shrink-0 disabled:opacity-40"
              >
                <Send className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </div>
          <p className="mt-1 px-2 text-[10px] text-muted/50">{t("chat.composerHint")}</p>
        </form>
      </div>
    </Card>
  );
}
