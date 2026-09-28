"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatPeer, Message, Role } from "@/types";
import { useT } from "@/lib/i18n/provider";

export function TeamChatView({
  initialMessages,
  peers,
  currentUserId,
  currentName,
  currentRole,
}: {
  initialMessages: Message[];
  peers: ChatPeer[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
}) {
  const t = useT();
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="shrink-0 pb-4">
        <PageHeader title={t("team.title")} subtitle={t("team.subtitle")}>
          <Button size="sm">
            <Plus className="h-4 w-4" />
            {t("chat.newThread")}
          </Button>
        </PageHeader>
      </div>
      <div className="min-h-0 flex-1">
        <ChatThread
          internal
          clientId={null}
          initialMessages={initialMessages}
          currentUserId={currentUserId}
          currentName={currentName}
          currentRole={currentRole}
          peers={peers}
          title="TyloTech Team"
          subtitle={t("chat.groupMembers", { n: String(peers.length) })}
          className="h-full"
        />
      </div>
    </div>
  );
}
