"use client";

import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ChatThread } from "@/components/chat/chat-thread";
import { UPDATE_META } from "@/lib/status";
import { Message, Role, Update } from "@/types";
import { formatRelativeTime } from "@/lib/utils";

export function ChatView({
  initialMessages,
  updates,
  currentUserId,
  currentName,
  currentRole,
  clientId,
}: {
  initialMessages: Message[];
  updates: Update[];
  currentUserId: string;
  currentName: string;
  currentRole: Role;
  clientId: string | null;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title="Chat & Updates" subtitle="Talk to your TyloTech team and track what we've shipped.">
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Request report or task
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChatThread
            initialMessages={initialMessages}
            currentUserId={currentUserId}
            currentName={currentName}
            currentRole={currentRole}
            clientId={clientId}
            title="TyloTech Team"
            subtitle="Sofia, Dawood & Haseeb · Online"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>This month at TyloTech</CardTitle>
            <Badge variant="brand">{updates.length}</Badge>
          </CardHeader>
          <div className="relative space-y-5 pl-5">
            <span className="absolute left-[7px] top-1.5 h-[calc(100%-1rem)] w-px bg-border" />
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
