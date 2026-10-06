"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { UPDATE_META } from "@/lib/status";
import { formatRelativeTime } from "@/lib/utils";
import { Update, UpdateType } from "@/types";
import { useT } from "@/lib/i18n/provider";

const TYPES: UpdateType[] = ["milestone", "report", "campaign", "note", "alert"];

export function UpdatesManager({
  updates,
  clientId,
  canPost,
}: {
  updates: Update[];
  clientId: string;
  canPost: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", type: "note" as UpdateType });
  const [editingId, setEditingId] = useState<string | null>(null);

  function startEdit(u: Update) {
    setEditingId(u.id);
    setForm({ title: u.title, description: u.description ?? "", type: u.type });
    setError(null);
    setOpen(true);
  }

  function toggleForm() {
    if (open) {
      setEditingId(null);
      setForm({ title: "", description: "", type: "note" });
    }
    setOpen((o) => !o);
  }

  async function post() {
    if (!form.title.trim()) {
      setError(t("upd.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/updates", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...form } : { clientId, ...form }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? t("upd.postFailed"));
      return;
    }
    setForm({ title: "", description: "", type: "note" });
    setEditingId(null);
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    const res = await fetch(`/api/updates?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setError(t("upd.deleteFailed"));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="flex justify-end">
          <Button size="sm" onClick={toggleForm}>
            {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {open ? t("common.cancel") : t("upd.post")}
          </Button>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="p-5">
              {error && <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="utitle">{t("upd.title")}</Label>
                  <Input id="utitle" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("upd.titlePh")} maxLength={160} />
                </div>
                <div>
                  <Label htmlFor="udesc">{t("upd.description")}</Label>
                  <Textarea id="udesc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t("upd.descriptionPh")} className="min-h-[80px]" />
                </div>
                <div>
                  <Label htmlFor="utype">{t("upd.type")}</Label>
                  <select id="utype" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as UpdateType }))} className="input-base appearance-none">
                    {TYPES.map((ty) => (
                      <option key={ty} value={ty} className="bg-surface">{t(UPDATE_META[ty].label)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <Button onClick={post} loading={saving}>{editingId ? t("common.save") : t("upd.publish")}</Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <div className="relative space-y-5 pl-5">
          <span className="absolute left-[7px] top-1.5 h-[calc(100%-1rem)] w-px bg-border" />
          {error && !open && <p className="text-sm text-danger">{error}</p>}
          {updates.length === 0 && <p className="py-6 text-sm text-muted">{t("upd.empty")}</p>}
          {updates.map((u) => {
            const meta = UPDATE_META[u.type];
            return (
              <div key={u.id} className="relative">
                <span className="absolute -left-[18px] top-1 h-3.5 w-3.5 rounded-full border-2 border-bg bg-brand" />
                <div className="flex items-center gap-2">
                  <Badge variant={meta.variant}>{t(meta.label)}</Badge>
                  <span className="text-[11px] text-muted/60">{formatRelativeTime(u.created_at)}</span>
                  {canPost && (
                    <button
                      type="button"
                      onClick={() => startEdit(u)}
                      className="ml-auto text-muted hover:text-foreground"
                      aria-label={t("upd.edit")}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canPost && (
                    <button
                      type="button"
                      onClick={() => remove(u.id)}
                      onBlur={() => setConfirmId((c) => (c === u.id ? null : c))}
                      className={confirmId === u.id ? "inline-flex items-center gap-1 text-xs font-medium text-danger" : "text-muted hover:text-danger"}
                      aria-label={t("upd.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmId === u.id && t("upd.confirmDelete")}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground">{u.title}</p>
                {u.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{u.description}</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
