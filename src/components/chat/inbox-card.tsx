"use client";

import { CheckCircle2, Clock, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { WAITING_ALERT_HOURS, useInbox, waitedFor } from "./inbox-provider";

/**
 * Internal Hub: every partner whose last message is still unanswered, longest
 * wait first — red once past the alert threshold (same-working-day promise).
 */
export function InboxCard({ clients }: { clients: { id: string; slug?: string | null; company: string; logo_url?: string | null }[] }) {
  const t = useT();
  const { locale } = useI18n();
  const inbox = useInbox();
  const now = Date.now();
  if (!inbox.loaded) return null;
  const waiting = clients
    .map((c) => ({ c, e: inbox.byClient[c.id] }))
    .filter((x) => x.e?.waitingSince)
    .sort((a, b) => a.e!.waitingSince!.localeCompare(b.e!.waitingSince!));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t("inbox.title")}</CardTitle>
          <p className="mt-0.5 text-xs text-muted">{t("inbox.subtitle", { h: WAITING_ALERT_HOURS })}</p>
        </div>
        {inbox.overdue.length > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
            <Clock className="h-3.5 w-3.5" /> {inbox.overdue.length}
          </span>
        )}
      </CardHeader>
      {waiting.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted">
          <CheckCircle2 className="h-4 w-4 text-success" /> {t("inbox.allAnswered")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {waiting.map(({ c, e }) => {
            const overdue = now - new Date(e!.waitingSince!).getTime() > WAITING_ALERT_HOURS * 3_600_000;
            return (
              <li key={c.id}>
                <Link
                  href={`/internal/clients/${c.slug ?? c.id}?tab=chat`}
                  className="flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <Avatar name={c.company} src={c.logo_url ?? null} logo size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{c.company}</span>
                    <span className={cn("flex items-center gap-1 text-xs", overdue ? "font-medium text-danger" : "text-muted")}>
                      <Clock className="h-3 w-3" /> {t("inbox.waiting", { time: waitedFor(e!.waitingSince!, locale, now) })}
                    </span>
                  </span>
                  {e!.unread > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-foreground">
                      <MessageSquare className="h-3 w-3" /> {e!.unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
