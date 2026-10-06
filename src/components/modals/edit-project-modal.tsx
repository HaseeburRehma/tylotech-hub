"use client";

import { ModalShell } from "@/components/ui/modal";
import { Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { Project } from "@/types";

/** Edit a project's name, description and due date (status/progress live in the row menu). */
export function EditProjectModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setDue(project.due ?? "");
    setError(null);
  }, [project]);

  async function save() {
    if (!project) return;
    if (!name.trim()) return setError(t("editProj.nameRequired"));
    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: project.id, name, description, due }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? t("editProj.error"));
    onClose();
    router.refresh();
  }

  const field =
    "w-full rounded-xl border border-border bg-bg px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-brand/50";

  return (
    <ModalShell open={!!project} onClose={onClose}>
      <div className="flex items-start gap-4 px-6 pt-6 pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15">
          <Pencil className="h-5 w-5 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">{t("editProj.title")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("editProj.desc")}</p>
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

      <div className="space-y-4 px-6">
        {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>}
        <div>
          <label htmlFor="ep-name" className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.name")}</label>
          <input id="ep-name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} className={`${field} h-11`} />
        </div>
        <div>
          <label htmlFor="ep-due" className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.due")}</label>
          <input id="ep-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} h-11`} />
        </div>
        <div>
          <label htmlFor="ep-desc" className="mb-1.5 block text-sm font-medium text-foreground">{t("newProj.descField")}</label>
          <textarea
            id="ep-desc"
            value={description}
            maxLength={1000}
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            className={`${field} resize-none py-3`}
          />
          <p className="mt-1 text-xs text-muted">{t("editProj.visibleToClient")}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
        >
          {t("common.cancel")}
        </button>
        <Button onClick={save} loading={saving}>
          {t("common.save")}
        </Button>
      </div>
    </ModalShell>
  );
}
