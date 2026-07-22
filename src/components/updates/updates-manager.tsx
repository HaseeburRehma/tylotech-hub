"use client";

import { Plus, Trash2, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", type: "note" as UpdateType });

  async function post() {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ...form }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? "Could not post update.");
      return;
    }
    setForm({ title: "", description: "", type: "note" });
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/updates?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {open ? "Cancel" : "Post update"}
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
                  <Label htmlFor="utitle">Title</Label>
                  <Input id="utitle" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="June campaign hit 4.7x ROAS" />
                </div>
                <div>
                  <Label htmlFor="udesc">Description</Label>
                  <Textarea id="udesc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What happened and what's next…" className="min-h-[80px]" />
                </div>
                <div>
                  <Label htmlFor="utype">Type</Label>
                  <select id="utype" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as UpdateType }))} className="input-base appearance-none">
                    {TYPES.map((t) => (
                      <option key={t} value={t} className="bg-surface">{UPDATE_META[t].label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <Button onClick={post} loading={saving}>Publish</Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <div className="relative space-y-5 pl-5">
          <span className="absolute left-[7px] top-1.5 h-[calc(100%-1rem)] w-px bg-border" />
          {updates.length === 0 && <p className="py-6 text-sm text-muted">No updates posted yet.</p>}
          {updates.map((u) => {
            const meta = UPDATE_META[u.type];
            return (
              <div key={u.id} className="relative">
                <span className="absolute -left-[18px] top-1 h-3.5 w-3.5 rounded-full border-2 border-bg bg-brand" />
                <div className="flex items-center gap-2">
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  <span className="text-[11px] text-muted/60">{formatRelativeTime(u.created_at)}</span>
                  {canPost && (
                    <button onClick={() => remove(u.id)} className="ml-auto text-muted hover:text-danger" aria-label="Delete update">
                      <Trash2 className="h-3.5 w-3.5" />
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
