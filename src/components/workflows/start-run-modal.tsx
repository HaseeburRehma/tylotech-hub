"use client";

import { Check, ListChecks, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { resolveDefaultAssignee, type StaffOption, type Template } from "@/lib/workflows-shared";
import { useRefresh } from "@/components/providers/refresh-provider";

/**
 * Pick a template + one, several or all partners, review who's responsible for
 * each step (pre-filled from the template roles, overridable) and start one run
 * per partner.
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
  clients: { id: string; company: string; logoUrl?: string | null }[];
  fixedClientId?: string;
}) {
  const t = useT();
  const router = useRouter();
  const refresh = useRefresh();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>(fixedClientId ? [fixedClientId] : []);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tpl = useMemo(() => templates.find((x) => x.id === templateId), [templates, templateId]);
  const sorted = useMemo(() => [...clients].sort((a, b) => a.company.localeCompare(b.company)), [clients]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((c) => c.company.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);
  const allSelected = sorted.length > 0 && selected.length === sorted.length;

  // Re-seed the per-step assignees from the template defaults whenever it changes.
  useEffect(() => {
    if (!tpl) return;
    setAssignees(Object.fromEntries(tpl.steps.map((s) => [s.id!, resolveDefaultAssignee(s, staff) ?? ""])));
    setName("");
  }, [tpl, staff]);

  useEffect(() => {
    if (open) {
      setError(null);
      setQuery("");
      if (fixedClientId) setSelected([fixedClientId]);
    }
  }, [open, fixedClientId]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function start() {
    if (!tpl || !selected.length) return setError(t("wf.pickTemplatePartner"));
    setBusy(true);
    setError(null);
    const res = await fetch("/api/workflows/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: tpl.id,
        clientIds: selected,
        name: name.trim() || undefined,
        assignees: Object.fromEntries(Object.entries(assignees).map(([k, v]) => [k, v || null])),
      }),
    }).catch(() => null);
    const data = (res ? await res.json().catch(() => ({})) : {}) as { id?: string; ids?: string[]; error?: string };
    setBusy(false);
    if (!res?.ok) {
      if (data.ids?.length) refresh();
      return setError(data.error ?? t("ait.actionFailed"));
    }
    onClose();
    if (selected.length === 1 && data.id) router.push(`/internal/processes/${data.id}`);
    else refresh();
  }

  const partnerName = clients.find((c) => c.id === fixedClientId)?.company;

  return (
    <ModalShell open={open} onClose={onClose} className="flex max-w-2xl flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-start gap-4 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15">
          <ListChecks className="h-5 w-5 text-brand-ink" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">{t("wf.startTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("wf.startDesc")}</p>
        </div>
        <button type="button" aria-label={t("common.close")} onClick={onClose} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body (scrolls; header + footer stay put) */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 sm:px-6">
        {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</div>}
        {templates.length === 0 ? (
          <p className="text-sm text-muted">{t("wf.noTemplates")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <Label htmlFor="wf-tpl">{t("wf.template")}</Label>
                <select id="wf-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-base h-11 w-full appearance-none truncate text-sm">
                  {templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <Label htmlFor="wf-name">{t("wf.runName")}</Label>
                <input
                  id="wf-name"
                  value={name}
                  maxLength={160}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tpl?.name}
                  className="input-base h-11 w-full text-sm"
                />
              </div>
            </div>

            {/* Partners: one, several or all */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Label className="mb-0">{t("wf.partner")}</Label>
                {!fixedClientId && sorted.length > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted">{t("wf.selectedCount", { n: selected.length, total: sorted.length })}</span>
                    <button
                      type="button"
                      onClick={() => setSelected(allSelected ? [] : sorted.map((c) => c.id))}
                      className="font-medium text-brand-ink hover:underline"
                    >
                      {allSelected ? t("wf.selectNone") : t("wf.selectAll")}
                    </button>
                  </div>
                )}
              </div>
              {fixedClientId ? (
                <p className="flex h-11 items-center rounded-xl border border-border px-3 text-sm text-foreground">{partnerName}</p>
              ) : (
                <div className="rounded-xl border border-border">
                  {sorted.length > 6 && (
                    <div className="flex items-center gap-2 border-b border-border px-3">
                      <Search className="h-4 w-4 shrink-0 text-muted" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("wf.searchPartner")}
                        aria-label={t("wf.searchPartner")}
                        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted/70"
                      />
                    </div>
                  )}
                  <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto p-1.5 sm:grid-cols-2">
                    {visible.map((c) => {
                      const on = selected.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggle(c.id)}
                          className={cn(
                            "flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                            on ? "bg-brand/10 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              on ? "border-brand bg-brand text-brand-foreground" : "border-border",
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <Avatar name={c.company} src={c.logoUrl} logo size={24} />
                          <span className="truncate">{c.company}</span>
                        </button>
                      );
                    })}
                    {visible.length === 0 && <p className="col-span-full px-2.5 py-3 text-sm text-muted">{t("wf.noPartnerMatch")}</p>}
                  </div>
                </div>
              )}
            </div>

            {tpl && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">{t("wf.whoDoesWhat")}</p>
                <ol className="divide-y divide-border/60 rounded-xl border border-border">
                  {tpl.steps.map((s, i) => (
                    <li key={s.id} className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center sm:gap-4">
                      <div className="flex min-w-0 gap-2.5">
                        <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <p className="text-sm leading-snug text-foreground">{s.title}</p>
                          {s.due_offset_days != null && <p className="mt-0.5 text-xs text-muted">{t("wf.daysAfterActive", { n: s.due_offset_days })}</p>}
                        </div>
                      </div>
                      <select
                        aria-label={`${t("wf.responsible")}: ${s.title}`}
                        value={assignees[s.id!] ?? ""}
                        onChange={(e) => setAssignees((a) => ({ ...a, [s.id!]: e.target.value }))}
                        className="input-base h-10 w-full appearance-none py-0 text-sm"
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

      {/* Footer */}
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
        <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
          {t("common.cancel")}
        </Button>
        <Button onClick={start} loading={busy} disabled={!tpl || !selected.length} className="w-full sm:w-auto">
          {selected.length > 1 ? t("wf.startMany", { n: selected.length }) : t("wf.start")}
        </Button>
      </div>
    </ModalShell>
  );
}
