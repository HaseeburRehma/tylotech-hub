"use client";

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
        <PageHeader title={t("team.title")} subtitle={t("team.subtitle")} />
      </div>
      <div className="min-h-0 flex-1 max-w-4xl">
        <ChatThread
          internal
          clientId={null}
          initialMessages={initialMessages}
          currentUserId={currentUserId}
          currentName={currentName}
          currentRole={currentRole}
          peers={peers}
          title={t("chat.team")}
          subtitle={t("chat.groupEveryone")}
          className="h-full"
        />
      </div>
    </div>
  );
}
