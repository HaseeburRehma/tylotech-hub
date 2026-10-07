"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import type { StaffOption, Template } from "@/lib/workflows-shared";

interface DraftStep {
  key: string;
  title: string;
  instructions: string;
  defaultAssigneeRole: string;
  defaultAssigneeUserId: string;
  dueOffsetDays: string;
}

const toDraft = (tpl: Template | null): DraftStep[] =>
  tpl?.steps.length
    ? tpl.steps.map((s, i) => ({
        key: s.id ?? `s${i}`,
        title: s.title,
        instructions: s.instructions ?? "",
        defaultAssigneeRole: s.default_assignee_role ?? "",
        defaultAssigneeUserId: s.default_assignee_user_id ?? "",
        dueOffsetDays: s.due_offset_days == null ? "" : String(s.due_offset_days),
      }))
    : [{ key: "s0", title: "", instructions: "", defaultAssigneeRole: "", defaultAssigneeUserId: "", dueOffsetDays: "" }];

/**
 * Create or edit a process template. Steps run top to bottom (v1 is linear).
 * Saving never affects runs already in progress — they keep their own copy.
 */
export function TemplateEditor({ template, staff, onDone }: { template: Template | null; staff: StaffOption[]; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [steps, setSteps] = useState<DraftStep[]>(() => toDraft(template));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roles = Array.from(new Set(staff.map((s) => s.title).filter(Boolean))) as string[];

  const update = (i: number, patch: Partial<DraftStep>) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      name,
      description,
      steps: steps.map((s) => ({
        title: s.title,
        instructions: s.instructions,
        defaultAssigneeRole: s.defaultAssigneeRole,
        defaultAssigneeUserId: s.defaultAssigneeUserId || null,
        dueOffsetDays: s.dueOffsetDays === "" ? null : Number(s.dueOffsetDays),
      })),
    };
    const res = await fetch(template ? `/api/workflows/templates/${template.id}` : "/api/workflows/templates", {
      method: template ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError((data as { error?: string }).error ?? t("ait.actionFailed"));
    router.refresh();
    onDone();
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h3 className="font-semibold text-foreground">{template ? t("wf.editTemplate") : t("wf.newTemplate")}</h3>
        <p className="mt-0.5 text-xs text-muted">{t("wf.templateHint")}</p>
      </div>
      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tpl-name">{t("wf.templateName")}</Label>
          <Input id="tpl-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kunden-Onboarding" />
        </div>
        <div>
          <Label htmlFor="tpl-desc">{t("wf.description")}</Label>
          <Input id="tpl-desc" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <datalist id="wf-roles">
        {roles.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="rounded-xl border border-border bg-surface-2/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("wf.step")} {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label={t("wf.moveUp")} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={t("wf.moveDown")} disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={t("wf.removeStep")}
                  disabled={steps.length === 1}
                  onClick={() => setSteps((list) => list.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px_110px]">
              <Input aria-label={t("wf.stepTitle")} value={s.title} maxLength={160} onChange={(e) => update(i, { title: e.target.value })} placeholder={t("wf.stepTitle")} />
              <Input
                aria-label={t("wf.defaultRole")}
                list="wf-roles"
                value={s.defaultAssigneeRole}
                maxLength={80}
                onChange={(e) => update(i, { defaultAssigneeRole: e.target.value })}
                placeholder={t("wf.defaultRole")}
              />
              <select
                aria-label={t("wf.defaultPerson")}
                value={s.defaultAssigneeUserId}
                onChange={(e) => update(i, { defaultAssigneeUserId: e.target.value })}
                className="input-base appearance-none text-sm"
              >
                <option value="">{t("wf.defaultPersonAny")}</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Input
                aria-label={t("wf.dueOffset")}
                type="number"
                min={0}
                max={365}
                value={s.dueOffsetDays}
                onChange={(e) => update(i, { dueOffsetDays: e.target.value })}
                placeholder={t("wf.dueOffsetPh")}
              />
            </div>
            <Textarea
              aria-label={t("wf.instructions")}
              value={s.instructions}
              maxLength={4000}
              onChange={(e) => update(i, { instructions: e.target.value })}
              placeholder={t("wf.instructionsPh")}
              className="mt-3 min-h-[60px] text-sm"
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={steps.length >= 50}
          onClick={() =>
            setSteps((list) => [...list, { key: `n${Date.now()}`, title: "", instructions: "", defaultAssigneeRole: "", defaultAssigneeUserId: "", dueOffsetDays: "" }])
          }
        >
          <Plus className="h-4 w-4" /> {t("wf.addStep")}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={busy} disabled={!name.trim() || steps.some((s) => !s.title.trim())}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
