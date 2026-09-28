"use client";

import { Check, FileText, Plus, Rocket, Star, Zap } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ChatThread } from "@/components/chat/chat-thread";
import { UPDATE_META } from "@/lib/status";
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
}: {
  initialMessages: Message[];
  updates: Update[];
  peers?: ChatPeer[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
  clientCompany?: string;
}) {
  const t = useT();
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function requestTask() {
    setRequesting(true);
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "📋 New request: I'd like to request a new report or task. Please advise on next steps.",
        clientId,
      }),
    }).catch(() => null);
    setRequesting(false);
    setRequested(true);
    setTimeout(() => setRequested(false), 4000);
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 shrink-0">
        <PageHeader title={t("chat.title")} subtitle={t("chat.subtitle")}>
          <Button size="sm" onClick={requestTask} loading={requesting}>
            {requested ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {requested ? t("chat.requestSent") : t("chat.requestTask")}
          </Button>
        </PageHeader>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Chat (takes remaining space) */}
        <div className="min-h-0 min-w-0 flex-1">
          <ChatThread
            initialMessages={initialMessages}
            currentUserId={currentUserId}
            currentName={currentName}
            currentRole={currentRole}
            clientId={clientId}
            peers={peers}
            title={t("chat.team")}
            subtitle={clientCompany ? t("chat.groupMembersClient", { n: String(peers.length), client: clientCompany }) : t("chat.groupMembers", { n: String(peers.length) })}
            className="h-full"
          />
        </div>

        {/* Updates sidebar */}
        <div className="hidden w-[300px] shrink-0 flex-col overflow-hidden lg:flex">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{t("chat.thisMonthAt")}</p>
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold text-brand">{updates.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {updates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Star className="mb-2 h-8 w-8 text-muted/20" />
                <p className="text-sm text-muted">{t("chat.noUpdates")}</p>
              </div>
            )}
            <div className="space-y-6">
              {updates.map((u) => {
                const Icon = TYPE_ICONS[u.type] ?? FileText;
                return (
                  <div key={u.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold leading-snug text-foreground">{u.title}</p>
                        <span className="shrink-0 text-[11px] text-muted">{formatRelativeTime(u.created_at)}</span>
                      </div>
                      {u.description && <p className="mt-1 text-[12px] leading-relaxed text-muted">{u.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
