"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ChatThread } from "@/components/chat/chat-thread";
import { UPDATE_META } from "@/lib/status";
import { ChatPeer, Message, Role, Update } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export function ChatView({
  initialMessages,
  updates,
  peers = [],
  currentUserId,
  currentName,
  currentRole,
  clientId,
}: {
  initialMessages: Message[];
  updates: Update[];
  peers?: ChatPeer[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
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
      <div className="mb-3 flex items-center justify-between">
        <PageHeader title={t("chat.title")} subtitle={t("chat.subtitle")}>
          <Button size="sm" variant="outline" onClick={requestTask} loading={requesting}>
            {requested ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {requested ? t("chat.requestSent") : t("chat.requestTask")}
          </Button>
        </PageHeader>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3 min-h-0">
          <ChatThread
            initialMessages={initialMessages}
            currentUserId={currentUserId}
            currentName={currentName}
            currentRole={currentRole}
            clientId={clientId}
            peers={peers}
            title={t("chat.team")}
            subtitle={t("chat.groupEveryone")}
            className="h-full"
          />
        </div>

        <Card className="overflow-y-auto">
          <CardHeader>
            <CardTitle>{t("chat.thisMonthAt")}</CardTitle>
            <Badge variant="brand">{updates.length}</Badge>
          </CardHeader>
          <div className="relative space-y-5 pl-5">
            {updates.length === 0 && (
              <p className="py-6 text-sm text-muted">{t("chat.noUpdates")}</p>
            )}
            {updates.length > 0 && (
              <span className="absolute left-[7px] top-1.5 h-[calc(100%-1rem)] w-px bg-border" />
            )}
            {updates.map((u) => {
              const meta = UPDATE_META[u.type];
              return (
                <div key={u.id} className="relative">
                  <span className="absolute -left-[18px] top-1 h-3.5 w-3.5 rounded-full border-2 border-bg bg-brand" />
                  <div className="flex items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-[11px] text-muted/60">{formatRelativeTime(u.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-foreground">{u.title}</p>
                  {u.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{u.description}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
