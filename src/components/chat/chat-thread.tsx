"use client";

import { motion } from "framer-motion";
import { Languages, Paperclip, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Message, Role } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";

export function ChatThread({
  initialMessages,
  currentUserId,
  currentName,
  currentRole,
  clientId,
  title,
  subtitle,
  className,
}: {
  initialMessages: Message[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [val, setVal] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));

  // Per-message chosen language + on-demand translation cache.
  type Lang = "en" | "de";
  const viewerLang: Lang = currentRole === "client" ? "de" : "en";
  const [langByMsg, setLangByMsg] = useState<Record<string, Lang>>({});
  const [cache, setCache] = useState<Record<string, Partial<Record<Lang, string>>>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const originalLangOf = (m: Message): Lang => (m.sender_role === "client" ? "de" : "en");

  // Both language versions we already know for a message (stored + cached).
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
  }, [messages]);

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
          setMessages((prev) => [
            ...prev,
            {
              id: m.id,
              client_id: m.client_id,
              sender_id: m.sender_id,
              sender_name: m.sender_name ?? "TyloTech",
              sender_role: (m.sender_role ?? "team") as Role,
              content: m.content,
              content_translated: m.content_translated ?? null,
              translated_to: m.translated_to ?? null,
              created_at: m.created_at,
            },
          ]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = val.trim();
    if (!content) return;
    setVal("");
    const tempId = `temp-${Date.now()}`;
    seen.current.add(tempId);
    setMessages((m) => [
      ...m,
      { id: tempId, client_id: clientId ?? "", sender_id: currentUserId, sender_name: currentName, sender_role: currentRole, content, created_at: new Date().toISOString() },
    ]);

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, clientId }),
    }).catch(() => null);
    if (res?.ok) {
      const { message } = await res.json();
      if (message?.id) {
        seen.current.add(message.id);
        setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, id: message.id } : x)));
      }
    }
  }

  return (
    <Card className={cn("flex h-[560px] flex-col p-0", className)}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="relative">
          <Avatar name={title} size={38} />
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-surface" />
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[11px] text-success">{subtitle ?? "Live · realtime"}</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          const selected: Lang = langByMsg[m.id] ?? viewerLang;
          const versions = versionsOf(m);
          const displayText = versions[selected] ?? m.content;
          const isTranslated = selected !== originalLangOf(m) && versions[selected] != null;
          const loading = pending[m.id] && versions[selected] == null;
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
                  {/* EN / DE toggle — available on every message for every account type */}
                  <span className="inline-flex overflow-hidden rounded-full border border-border">
                    {(["en", "de"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => pickLang(m, l)}
                        title={l === "en" ? "English" : "Deutsch"}
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] font-semibold uppercase transition-colors",
                          selected === l ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground",
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </span>
                  {isTranslated && (
                    <span className="inline-flex items-center gap-1 text-brand">
                      <Languages className="h-2.5 w-2.5" />
                      {selected === "de" ? "Übersetzt" : "Translated"}
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
          placeholder="Write a message…"
          className="h-11 flex-1 rounded-xl border border-border bg-bg/60 px-4 text-sm outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0">
          <Send className="h-[18px] w-[18px]" />
        </Button>
      </form>
    </Card>
  );
}
