"use client";

import { ClipboardList, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { useActiveClient } from "@/components/providers/active-client-provider";
import { useT } from "@/lib/i18n/provider";
import { PROJECT_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/types";
import type { TeamMember } from "@/lib/data";
import { useRefresh } from "@/components/providers/refresh-provider";

const NEW_STATUSES: ProjectStatus[] = ["planning", "in_progress", "review", "done"];
const label = "mb-1.5 block text-body-sm text-soft";
const field =
  "w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 field-focus";

export function NewProjectModal({
  open,
  onClose,
  clients,
  members,
}: {
  open: boolean;
  onClose: () => void;
  clients: { id: string; company: string }[];
  members: TeamMember[];
}) {
  const t = useT();
  const refresh = useRefresh();
  const { active } = useActiveClient();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [due, setDue] = useState("");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form every time it opens, pre-selecting the client picked in the sidebar.
  useEffect(() => {
    if (!open) return;
    setName("");
    setStatus("planning");
    setDue("");
    setAssignedIds([]);
    setDescription("");
    setError(null);
    setClientId(active && clients.some((c) => c.id === active.id) ? active.id : clients[0]?.id ?? "");
  }, [open, active, clients]);

  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const available = members.filter((m) => !assignedIds.includes(m.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !clientId) return setError(t("newProj.required"));
    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, name, status, progress: status === "done" ? 100 : 0, assigneeIds: assignedIds, due, description }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? t("newProj.error"));
    onClose();
    refresh();
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="flex items-start gap-4 border-b border-line px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle">
            <ClipboardList className="h-5 w-5 text-brand-icon" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">{t("newProj.title")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("newProj.desc")}</p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          {clients.length === 0 && (
            <div className="rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-soft">
              {t("newProj.noClients")}{" "}
              <Link href="/internal/onboard" className="font-medium text-brand-ink hover:underline">
                {t("newProj.addClient")}
              </Link>
            </div>
          )}

          <div>
            <label htmlFor="np-name" className={label}>{t("newProj.name")}</label>
            <input
              id="np-name"
              autoFocus
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newProj.namePlaceholder")}
              className={cn(field, "h-11")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="np-client" className={label}>{t("newProj.client")}</label>
              <Select
                id="np-client"
                value={clientId}
                onChange={setClientId}
                disabled={clients.length === 0}
                placeholder={t("newProj.client")}
                searchPlaceholder={t("newProj.searchClient")}
                emptyLabel={t("newProj.noMatch")}
                options={clients.map((c) => ({
                  value: c.id,
                  label: c.company,
                  icon: <Avatar name={c.company} size={20} className="rounded-md text-eyebrow" />,
                }))}
              />
            </div>
            <div>
              <label htmlFor="np-status" className={label}>{t("newProj.status")}</label>
              <Select
                id="np-status"
                value={status}
                onChange={setStatus}
                options={NEW_STATUSES.map((s) => ({
                  value: s,
                  label: t(PROJECT_STATUS[s].label),
                  icon: <span className={cn("h-1.5 w-1.5 rounded-full", PROJECT_STATUS[s].dot)} />,
                }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="np-due" className={label}>{t("newProj.due")}</label>
              <input id="np-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(field, "h-11")} />
            </div>
            <div>
              <span id="np-assignee" className={label}>{t("newProj.assignee")}</span>
              <div
                role="group"
                aria-labelledby="np-assignee"
                className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-border bg-bg px-2 py-1.5"
              >
                {assignedIds.map((id) => (
                  <span key={id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-1.5 text-xs text-foreground">
                    <Avatar name={memberName[id] ?? "?"} size={20} />
                    <span className="truncate">{memberName[id] ?? "?"}</span>
                    <button
                      type="button"
                      aria-label={`${t("chat.remove")}: ${memberName[id] ?? ""}`}
                      onClick={() => setAssignedIds((prev) => prev.filter((x) => x !== id))}
                      className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {available.length > 0 && (
                  <Menu
                    width={240}
                    trigger={({ toggle, open: menuOpen }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted transition-colors hover:border-brand/40 hover:text-brand-ink"
                      >
                        <Plus className="h-3 w-3" />
                        {assignedIds.length === 0 && t("newProj.addPerson")}
                      </button>
                    )}
                  >
                    {(close) =>
                      available.map((m) => (
                        <MenuItem
                          key={m.id}
                          icon={<Avatar name={m.name} size={20} />}
                          onSelect={() => {
                            setAssignedIds((prev) => [...prev, m.id]);
                            close();
                          }}
                        >
                          <span className="block truncate">{m.name}</span>
                          <span className="block truncate text-caption text-muted">{m.role}</span>
                        </MenuItem>
                      ))
                    }
                  </Menu>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="np-desc" className="text-body-sm text-soft">{t("newProj.descField")}</label>
              <span className="text-xs text-muted">{t("reqTool.optional")}</span>
            </div>
            <textarea
              id="np-desc"
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(field, "resize-none py-3")}
            />
            <p className="mt-1 text-xs text-muted">{t("editProj.visibleToClient")}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line bg-bg px-6 py-4">
          <Button type="button" variant="secondary" size="sm" className="h-10" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" className="h-10" loading={saving} disabled={clients.length === 0}>
            {t("newProj.create")}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
