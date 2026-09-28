"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { ProjectStatus } from "@/types";
import type { TeamMember } from "@/lib/data";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "proj.planning" },
  { value: "in_progress", label: "proj.inProgress" },
  { value: "review", label: "proj.review" },
  { value: "done", label: "proj.done" },
];

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
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [due, setDue] = useState("");
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.name]));

  function toggleAssignee(id: string) {
    setAssignedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function removeAssignee(id: string) {
    setAssignedIds((prev) => prev.filter((x) => x !== id));
  }

  async function submit() {
    if (!name.trim() || !clientId) {
      setError("Client and project name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        name,
        status,
        progress: "0",
        assignedToId: assignedIds[0] ?? null,
        assignedToName: assignedIds.map((id) => memberMap[id]).filter(Boolean).join(", ") || null,
        due,
        description,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create project.");
      return;
    }
    setName("");
    setDescription("");
    setDue("");
    setAssignedIds([]);
    onClose();
    router.refresh();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-foreground/25 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-border bg-bg shadow-float" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-start gap-4 px-6 pt-6 pb-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15">
                  <ClipboardList className="h-5 w-5 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-foreground">{t("newProj.title")}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t("newProj.desc")}</p>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4 px-6">
                {error && (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>
                )}

                {/* Project name */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.name")}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50"
                  />
                </div>

                {/* Client + Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.client")}</label>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none focus:border-brand/50"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id} className="bg-surface">{c.company}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.status")}</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                      className="h-11 w-full appearance-none rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none focus:border-brand/50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value} className="bg-surface">{t(s.label)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Due + Assignee */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.due")}</label>
                    <input
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors focus:border-brand/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.assignee")}</label>
                    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-2">
                      {assignedIds.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 pl-1 pr-2 py-0.5">
                          <Avatar name={memberMap[id] ?? ""} size={22} />
                          <button onClick={() => removeAssignee(id)} className="text-muted hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <div className="relative group">
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border text-muted hover:border-brand/40 hover:text-brand transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <div className="absolute left-0 top-full z-10 mt-1 hidden w-48 rounded-xl border border-border bg-surface p-1 shadow-float group-focus-within:block group-hover:block">
                          {members.filter((m) => !assignedIds.includes(m.id)).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleAssignee(m.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2"
                            >
                              <Avatar name={m.name} size={24} />
                              <span className="truncate">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">{t("newProj.descField")}</label>
                    <span className="text-xs text-muted">{t("reqTool.optional")}</span>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50 resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 mt-2">
                <button
                  onClick={onClose}
                  className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
                >
                  {t("common.cancel")}
                </button>
                <Button onClick={submit} loading={saving}>
                  {t("newProj.create")}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
