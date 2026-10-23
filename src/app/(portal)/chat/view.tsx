"use client";

import { ModalShell } from "@/components/ui/modal";
import { Check, FileText, Plus, Rocket, Star, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatPeer, Message, Role, Update } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { type LucideIcon } from "lucide-react";

const TYPE_ICONS: Record<string, LucideIcon> = {
  milestone: Star,
  report: FileText,
  campaign: Rocket,
  note: FileText,
  alert: Zap,
};

export function ChatView({
  initialMessages,
  updates,
  peers = [],
  currentUserId,
  currentName,
  currentRole,
  clientId,
  clientCompany,
  clientLogoUrl = null,
}: {
  initialMessages: Message[];
  updates: Update[];
  peers?: ChatPeer[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
  clientCompany?: string;
  clientLogoUrl?: string | null;
}) {
  // Opening the chat counts as reading its notifications (the bell links here).
  useEffect(() => {
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hrefPrefix: "/chat" }),
    }).catch(() => null);
  }, []);
  const t = useT();
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showUpdates, setShowUpdates] = useState(false);

  async function requestTask() {
    setRequesting(true);
    setRequestError(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: t("chat.requestTaskMessage"), clientId }),
    }).catch(() => null);
    setRequesting(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setRequestError(d.error ?? t("chat.sendFailed"));
      return;
    }
    setRequested(true);
    setTimeout(() => setRequested(false), 4000);
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col">
      <div className="mb-3 shrink-0">
        <PageHeader title={t("chat.title")} subtitle={t("chat.subtitle")}>
          <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setShowUpdates(true)}>
            <Star className="h-4 w-4" /> {t("chat.updatesShort", { n: updates.length })}
          </Button>
          {/* Posts "I'd like to request a task" as the sender — only meaningful for clients. */}
          {currentRole === "client" && (
            <Button size="sm" onClick={requestTask} loading={requesting}>
              {requested ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {requested ? t("chat.requestSent") : t("chat.requestTask")}
            </Button>
          )}
        </PageHeader>
        {requestError && <p role="alert" className="mt-2 text-sm text-danger">{requestError}</p>}
        <ModalShell open={showUpdates} onClose={() => setShowUpdates(false)}>
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <p className="text-sm font-semibold text-foreground">{t("chat.thisMonthAt")}</p>
            <button type="button" onClick={() => setShowUpdates(false)} aria-label={t("widget.close")} className="text-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <UpdatesList updates={updates} />
          </div>
        </ModalShell>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Chat (takes remaining space) */}
        <div className="min-h-0 min-w-0 flex-1">
          <ChatThread
            key={clientId ?? "internal"}
            initialMessages={initialMessages}
            currentUserId={currentUserId}
            currentName={currentName}
            currentRole={currentRole}
            clientId={clientId}
            clientLogoUrl={clientLogoUrl}
            peers={peers}
            title={t("chat.team")}
            subtitle={clientCompany ? t("chat.groupMembersClient", { n: String(peers.length), client: clientCompany }) : t("chat.groupMembers", { n: String(peers.length) })}
            className="h-full"
          />
        </div>

        {/* Updates column (Figma "This month at TyloTech") */}
        <section className="card hidden w-[300px] shrink-0 flex-col overflow-hidden lg:flex">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
            <p className="font-display text-[15px] font-semibold text-foreground">{t("chat.thisMonthAt")}</p>
            <span className="rounded-md bg-line px-1.5 font-mono text-[10.5px] text-muted">{updates.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <UpdatesList updates={updates} />
          </div>
        </section>
      </div>
    </div>
  );
}

function UpdatesList({ updates }: { updates: Update[] }) {
  const t = useT();
  if (updates.length === 0)
    return (
      <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
        <Star className="mb-2 h-8 w-8 text-muted/30" />
        <p className="text-sm text-muted">{t("chat.noUpdates")}</p>
      </div>
    );
  return (
    <ul className="divide-y divide-line">
      {updates.map((u) => {
        const Icon = TYPE_ICONS[u.type] ?? FileText;
        return (
          <li key={u.id} className="px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand-ink">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11.5px] text-muted">{formatRelativeTime(u.created_at)}</span>
            </div>
            <p className="mt-2.5 font-display text-[14px] font-semibold leading-snug text-foreground">{u.title}</p>
            {u.description && <p className="mt-1 text-[12.5px] leading-[19px] text-soft">{u.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}
