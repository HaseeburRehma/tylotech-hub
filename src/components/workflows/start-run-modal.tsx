"use client";

import { ListChecks, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import { resolveDefaultAssignee, type StaffOption, type Template } from "@/lib/workflows-shared";

/**
 * Pick a template (+ partner, unless fixed), review who's responsible for each
 * step (pre-filled from the template roles, overridable) and start the run.
 */
export function StartRunModal({
  open,
  onClose,
  templates,
  staff,
  clients,
  fixedClientId,
}: {
  open: boolean;
  onClose: () => void;
  templates: Template[];
  staff: StaffOption[];
  clients: { id: string; company: string }[];
  fixedClientId?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [name, setName] = useState("");
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tpl = useMemo(() => templates.find((x) => x.id === templateId), [templates, templateId]);

  // Re-seed the per-step assignees from the template defaults whenever it changes.
  useEffect(() => {
    if (!tpl) return;
    setAssignees(Object.fromEntries(tpl.steps.map((s) => [s.id!, resolveDefaultAssignee(s, staff) ?? ""])));
    setName("");
  }, [tpl, staff]);

  useEffect(() => {
    if (open) {
      setError(null);
      if (fixedClientId) setClientId(fixedClientId);
    }
  }, [open, fixedClientId]);

  async function start() {
    if (!tpl || !clientId) return setError(t("wf.pickTemplatePartner"));
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workflows/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: tpl.id,
        clientId,
        name: name.trim() || undefined,
        assignees: Object.fromEntries(Object.entries(assignees).map(([k, v]) => [k, v || null])),
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setError((data as { error?: string }).error ?? t("ait.actionFailed"));
    onClose();
    router.push(`/internal/processes/${(data as { id: string }).id}`);
  }

  const partnerName = clients.find((c) => c.id === clientId)?.company;

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="flex items-start gap-4 px-6 pt-6 pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15">
          <ListChecks className="h-5 w-5 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">{t("wf.startTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("wf.startDesc")}</p>
        </div>
        <button type="button" aria-label={t("common.close")} onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6">
        {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>}
        {templates.length === 0 ? (
          <p className="text-sm text-muted">{t("wf.noTemplates")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="wf-tpl">{t("wf.template")}</Label>
                <select id="wf-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-base h-11 appearance-none text-sm">
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="wf-client">{t("wf.partner")}</Label>
                {fixedClientId ? (
                  <p className="flex h-11 items-center text-sm text-foreground">{partnerName}</p>
                ) : (
                  <select id="wf-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-base h-11 appearance-none text-sm">
                    <option value="">{t("wf.pickPartner")}</option>
                    {[...clients].sort((a, b) => a.company.localeCompare(b.company)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="wf-name">{t("wf.runName")}</Label>
              <input
                id="wf-name"
                value={name}
                maxLength={160}
                onChange={(e) => setName(e.target.value)}
                placeholder={tpl?.name}
                className="input-base h-11 text-sm"
              />
            </div>
            {tpl && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">{t("wf.whoDoesWhat")}</p>
                <ol className="space-y-2">
                  {tpl.steps.map((s, i) => (
                    <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm">
                        <span className="mr-2 text-xs tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                        {s.title}
                        {s.due_offset_days != null && <span className="ml-2 text-xs text-muted">· {t("wf.daysAfterActive", { n: s.due_offset_days })}</span>}
                      </span>
                      <select
                        aria-label={`${t("wf.responsible")}: ${s.title}`}
                        value={assignees[s.id!] ?? ""}
                        onChange={(e) => setAssignees((a) => ({ ...a, [s.id!]: e.target.value }))}
                        className="input-base h-9 w-full appearance-none py-0 text-sm sm:w-56"
                      >
                        <option value="">{t("wf.unassigned")}</option>
                        {staff.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button onClick={start} loading={busy} disabled={!tpl || !clientId}>
          {t("wf.start")}
        </Button>
      </div>
    </ModalShell>
  );
}
