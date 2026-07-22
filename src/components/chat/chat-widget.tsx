"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useUser } from "@/components/providers/user-provider";
import { cn } from "@/lib/utils";

const QUICK = ["Request a report", "Book a call", "New AI task"];

export function ChatWidget() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ me: boolean; text: string }[]>([
    { me: false, text: "Hi! 👋 This is the TyloTech team. How can we help today?" },
  ]);
  const [val, setVal] = useState("");
  const pathname = usePathname();

  // The quick-contact widget is for clients only; staff use the per-client chat inbox.
  // Also hidden on the full chat page to avoid duplication.
  if (user.role !== "client" || pathname.startsWith("/chat")) return null;

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { me: true, text }]);
    setVal("");
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, clientId: user.client_id }),
    }).catch(() => null);
    setMsgs((m) => [
      ...m,
      {
        me: false,
        text: res?.ok
          ? "Sent ✓ — your team will reply in Chat shortly."
          : "Couldn't send right now — please try the Chat page.",
      },
    ]);
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="glass fixed bottom-24 right-5 z-50 flex h-[460px] w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-border shadow-float"
          >
            <div className="flex items-center justify-between border-b border-border bg-surface/60 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="relative">
                  <Avatar name="Sofia Lind" size={34} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-bg" />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">TyloTech Team</p>
                  <p className="text-[11px] text-success">Online · replies in ~5m</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Close chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {msgs.map((m, i) => (
                <div key={i} className={cn("flex", m.me ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                      m.me
                        ? "bg-brand text-brand-foreground"
                        : "bg-surface-2 text-foreground",
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-brand/40 hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(val);
              }}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <input
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="Message TyloTech…"
                className="h-10 flex-1 rounded-xl border border-border bg-bg/60 px-3 text-sm outline-none focus:border-brand/50"
              />
              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-foreground transition hover:brightness-110"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-glow"
        aria-label="Message TyloTech"
      >
        {!open && (
          <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-brand/40" />
        )}
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span key="m" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageSquare className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
