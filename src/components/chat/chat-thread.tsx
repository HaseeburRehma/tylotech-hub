"use client";

import { motion } from "framer-motion";
import { Languages, Paperclip, Send, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { ChatPeer, Message, Role } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const GROUP = "group";

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
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selected, setSelected] = useState<string>(GROUP); // GROUP | peerId
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [val, setVal] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

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

  const originalLangOf = (m: Message): Lang => (m.sender_role === "client" ? "de" : "en");

  const versionsOf = (m: Message): Partial<Record<Lang, string>> => {
    const v: Partial<Record<Lang, string>> = { [originalLangOf(m)]: m.content };
    if (m.content_translated && (m.translated_to === "en" || m.translated_to === "de")) {
      v[m.translated_to as Lang] = m.content_translated;
    }
    return { ...v, ...(cache[m.id] ?? {}) };
  };

  async function ensureLang(m: Message, target: Lang) {
    if (versionsOf(m)[target]) return;
    setPending((p) => ({ ...p, [m.id]: true }));
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: m.content, target }),
    }).catch(() => null);
    if (res?.ok) {
      const { translation } = await res.json();
      setCache((c) => ({ ...c, [m.id]: { ...(c[m.id] ?? {}), [target]: translation } }));
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
    if (!clientId) return;
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`messages:${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const m = payload.new as any;
          if (seen.current.has(m.id)) return;
          seen.current.add(m.id);
          const msg: Message = {
            id: m.id,
            client_id: m.client_id,
            sender_id: m.sender_id,
            sender_name: m.sender_name ?? "TyloTech",
            sender_role: (m.sender_role ?? "team") as Role,
            recipient_id: m.recipient_id ?? null,
            content: m.content,
            content_translated: m.content_translated ?? null,
            translated_to: m.translated_to ?? null,
            created_at: m.created_at,
          };
          setMessages((prev) => [...prev, msg]);
          const key = !msg.recipient_id
            ? GROUP
            : msg.sender_id === currentUserId
              ? msg.recipient_id
              : msg.sender_id;
          if (msg.sender_id !== currentUserId && key !== selectedRef.current) {
            setUnread((u) => ({ ...u, [key]: (u[key] ?? 0) + 1 }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, currentUserId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
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
      body: JSON.stringify({ content, clientId, recipientId }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)));
      }
    }
  }

  const activePeer = peers.find((p) => p.id === selected);
  const headerTitle = selected === GROUP ? title : activePeer?.name ?? title;
  const headerSubtitle =
    selected === GROUP ? subtitle ?? "Group · everyone" : activePeer?.title ?? "Direct message";

  const threads: { key: string; name: string; sub: string; icon?: boolean }[] = [
    { key: GROUP, name: title, sub: "Group thread", icon: true },
    ...peers.map((p) => ({ key: p.id, name: p.name, sub: p.title ?? "Direct message" })),
  ];

  return (
    <Card className={cn("flex h-[560px] p-0", className)}>
      {/* ---- Thread rail (only when there are people to DM) ---- */}
      {peers.length > 0 && (
        <div className="flex w-56 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Conversations</p>
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
                      {last ? last.content : t.sub}
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
              <p>No messages yet.</p>
              <p className="text-xs text-muted/70">
                {selected === GROUP ? "Say hello to the team." : `Start a private chat with ${headerTitle}.`}
              </p>
            </div>
          )}
          {visible.map((m) => {
            const mine = m.sender_id === currentUserId;
            const selectedLang: Lang = langByMsg[m.id] ?? viewerLang;
            const versions = versionsOf(m);
            const displayText = versions[selectedLang] ?? m.content;
            const isTranslated = selectedLang !== originalLangOf(m) && versions[selectedLang] != null;
            const loading = pending[m.id] && versions[selectedLang] == null;
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
                  <div
                    title={isTranslated ? `Original: ${m.content}` : undefined}
                    className={cn(
                      "inline-block rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      mine ? "rounded-br-md bg-brand text-brand-foreground" : "rounded-bl-md bg-surface-2 text-foreground",
                    )}
                  >
                    {loading ? <span className="opacity-60">…</span> : displayText}
                  </div>
                  <div className={cn("mt-1 flex items-center gap-2 text-[10px] text-muted/60", mine && "flex-row-reverse")}>
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
                    {isTranslated && (
                      <span className="inline-flex items-center gap-1 text-brand">
                        <Languages className="h-2.5 w-2.5" />
                        {selectedLang === "de" ? "Übersetzt" : "Translated"}
                      </span>
                    )}
                    <span>{formatRelativeTime(m.created_at)}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
          <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:text-foreground">
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={selected === GROUP ? "Message the team…" : `Message ${headerTitle}…`}
            className="h-11 flex-1 rounded-xl border border-border bg-bg/60 px-4 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0">
            <Send className="h-[18px] w-[18px]" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
