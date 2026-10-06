"use client";

import { Mail, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "team";
  title: string | null;
  avatarUrl: string | null;
  active: boolean;
  lastSignIn: string | null;
}

export function MembersView({ members, currentUserId, isAdmin }: { members: StaffRow[]; currentUserId: string; isAdmin: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);

  async function update(id: string, body: Record<string, unknown>) {
    setBusy(id);
    const res = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    setNotice(res?.ok ? { ok: true, text: t("members.saved") } : { ok: false, text: d.error ?? t("ait.actionFailed") });
    if (res?.ok) router.refresh();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: [{ email: inviteEmail, name: inviteName }] }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setInviting(false);
    const r = d.results?.[0];
    if (res?.ok && r?.status === "invited") {
      setNotice({ ok: true, text: r.emailed ? t("members.invited", { email: r.email }) : t("members.invitedNoEmail", { email: r.email }) });
      setInviteEmail("");
      setInviteName("");
      router.refresh();
    } else {
      setNotice({ ok: false, text: r?.status === "exists" ? t("ob.inviteExists", { emails: r.email }) : d.error ?? r?.error ?? t("ait.actionFailed") });
    }
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : t("members.never");

  return (
    <div className="space-y-6">
      <PageHeader title={t("members.title")} subtitle={t("members.subtitle", { n: members.filter((m) => m.active).length })}>
        {isAdmin && (
          <Link href="/internal/team/new">
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4" /> {t("members.createWithPassword")}
            </Button>
          </Link>
        )}
      </PageHeader>

      {notice && (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            notice.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {notice.text}
        </div>
      )}

      <form onSubmit={invite} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <UserPlus className="h-3.5 w-3.5" /> {t("members.inviteTitle")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@tylotech.de" className="pl-9" />
            </div>
            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder={t("auth.fullName")} className="sm:w-56" />
          </div>
        </div>
        <Button type="submit" loading={inviting}>
          {t("members.sendInvite")}
        </Button>
      </form>

      <div className="card divide-y divide-border">
        {members.map((m) => {
          const self = m.id === currentUserId;
          return (
            <div key={m.id} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", !m.active && "opacity-60")}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={m.name} src={m.avatarUrl} size={40} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{m.name}</span>
                    {self && <Badge variant="neutral">{t("members.you")}</Badge>}
                    {!m.active && <Badge variant="danger">{t("members.deactivated")}</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.email} · {t("members.lastSignIn", { date: fmt(m.lastSignIn) })}
                  </p>
                </div>
              </div>

              {isAdmin ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    defaultValue={m.title ?? ""}
                    placeholder={t("settings.role")}
                    maxLength={80}
                    aria-label={t("settings.role")}
                    onBlur={(e) => e.target.value.trim() !== (m.title ?? "") && update(m.id, { title: e.target.value })}
                    className="h-9 w-40 text-xs"
                  />
                  <select
                    value={m.role}
                    disabled={self || busy === m.id}
                    aria-label={t("settings.access")}
                    onChange={(e) => update(m.id, { role: e.target.value })}
                    className="input-base h-9 w-32 appearance-none py-0 text-xs"
                  >
                    <option value="team">Team</option>
                    <option value="admin">Admin</option>
                  </select>
                  {!self && (
                    <Button
                      size="sm"
                      variant={m.active ? "ghost" : "outline"}
                      loading={busy === m.id}
                      onBlur={() => setConfirm((c) => (c === m.id ? null : c))}
                      className={m.active && confirm === m.id ? "text-danger" : undefined}
                      onClick={() => {
                        if (m.active && confirm !== m.id) return setConfirm(m.id);
                        setConfirm(null);
                        update(m.id, { active: !m.active });
                      }}
                    >
                      {!m.active ? t("members.reactivate") : confirm === m.id ? t("members.confirmDeactivate") : t("members.deactivate")}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{m.title ?? (m.role === "admin" ? "Admin" : "Team")}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isAdmin && <p className="text-xs text-muted">{t("members.adminOnly")}</p>}
    </div>
  );
}
