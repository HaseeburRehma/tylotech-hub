"use client";

import { Archive, ArchiveRestore, Check, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useUser } from "@/components/providers/user-provider";
import { RunCard } from "@/components/workflows/run-parts";
import { StartRunModal } from "@/components/workflows/start-run-modal";
import { TemplateEditor } from "@/components/workflows/template-editor";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { activeStep, berlinToday, isOverdue, type Run, type StaffOption, type Template } from "@/lib/workflows-shared";

type Tab = "board" | "mine" | "templates";

export function ProcessesView({
  tab,
  runs,
  templates,
  staff,
  clients,
}: {
  tab: Tab;
  runs: Run[];
  templates: Template[];
  staff: StaffOption[];
  clients: { id: string; company: string }[];
}) {
  const t = useT();
  const [starting, setStarting] = useState(false);
  const company = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.company])), [clients]);
  const liveTemplates = templates.filter((x) => !x.archived);

  const tabs: { key: Tab; label: string }[] = [
    { key: "board", label: t("wf.tab.board") },
    { key: "mine", label: t("wf.tab.mine") },
    { key: "templates", label: t("wf.tab.templates") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("wf.title")} subtitle={t("wf.subtitle")}>
        <Button size="sm" onClick={() => setStarting(true)} disabled={!liveTemplates.length}>
          <Plus className="h-4 w-4" /> {t("wf.startProcess")}
        </Button>
      </PageHeader>
      <StartRunModal open={starting} onClose={() => setStarting(false)} templates={liveTemplates} staff={staff} clients={clients} />

      <nav className="flex w-fit gap-1 rounded-xl border border-border bg-surface p-1" aria-label={t("wf.title")}>
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.key === "board" ? "/internal/processes" : `/internal/processes?tab=${x.key}`}
            aria-current={tab === x.key ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", tab === x.key ? "bg-brand/10 font-medium text-foreground" : "text-muted hover:text-foreground")}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "board" && <Board runs={runs} staff={staff} company={company} />}
      {tab === "mine" && <MyTasks runs={runs} company={company} />}
      {tab === "templates" && <Templates templates={templates} staff={staff} />}
    </div>
  );
}

function Board({ runs, staff, company }: { runs: Run[]; staff: StaffOption[]; company: Record<string, string> }) {
  const t = useT();
  const [showDone, setShowDone] = useState(false);
  const open = runs.filter((r) => r.status !== "completed");
  const done = runs.filter((r) => r.status === "completed");
  const overdue = open.filter((r) => {
    const s = activeStep(r.steps);
    return r.status === "active" && s && isOverdue(s);
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="info">{t("wf.countActive", { n: open.filter((r) => r.status === "active").length })}</Badge>
        {open.some((r) => r.status === "paused") && <Badge variant="warning">{t("wf.countPaused", { n: open.filter((r) => r.status === "paused").length })}</Badge>}
        {overdue > 0 && <Badge variant="danger">{t("wf.countOverdue", { n: overdue })}</Badge>}
      </div>
      {open.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted">{t("wf.noRuns")}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {open.map((r) => (
            <RunCard key={r.id} run={r} partner={company[r.client_id ?? ""] ?? "—"} staff={staff} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-sm text-muted hover:text-foreground" aria-expanded={showDone}>
            {showDone ? t("wf.hideDone") : t("wf.showDone", { n: done.length })}
          </button>
          {showDone && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {done.map((r) => (
                <RunCard key={r.id} run={r} partner={company[r.client_id ?? ""] ?? "—"} staff={staff} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Every active step assigned to me, across all running processes. */
function MyTasks({ runs, company }: { runs: Run[]; company: Record<string, string> }) {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = berlinToday();
  const tasks = runs
    .filter((r) => r.status === "active")
    .flatMap((r) => r.steps.filter((s) => s.status === "active" && s.assignee_user_id === user.id).map((s) => ({ run: r, step: s })))
    .sort((a, b) => (a.step.due_date ?? "9999").localeCompare(b.step.due_date ?? "9999"));

  async function check(stepId: string) {
    setBusy(stepId);
    setError(null);
    const res = await fetch(`/api/workflows/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError((d as { error?: string }).error ?? t("ait.actionFailed"));
    }
    router.refresh();
  }

  if (!tasks.length) return <Card className="py-12 text-center text-sm text-muted">{t("wf.noTasks")}</Card>;
  return (
    <Card className="p-0">
      {error && <p className="border-b border-border px-5 py-3 text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-border/60">
        {tasks.map(({ run, step }) => {
          const overdue = !!step.due_date && step.due_date < today;
          return (
            <li key={step.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/internal/processes/${run.id}`} className="font-medium text-foreground hover:underline">
                  {step.title}
                </Link>
                <p className="text-xs text-muted">
                  {run.name} · {company[run.client_id ?? ""] ?? "—"}
                  {step.due_date && (
                    <span className={overdue ? "font-medium text-danger" : ""}>
                      {" "}
                      · {overdue ? t("wf.overdueSince") : t("wf.due")}{" "}
                      {new Date(`${step.due_date}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}
                    </span>
                  )}
                </p>
              </div>
              <Button size="sm" loading={busy === step.id} onClick={() => check(step.id)}>
                <Check className="h-4 w-4" /> {t("wf.checkOff")}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Templates({ templates, staff }: { templates: Template[]; staff: StaffOption[] }) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function setArchived(tpl: Template, archived: boolean) {
    setBusy(tpl.id);
    await fetch(`/api/workflows/templates/${tpl.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  if (editing) return <TemplateEditor template={editing === "new" ? null : editing} staff={staff} onDone={() => setEditing(null)} />;

  const sorted = [...templates].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
        <Plus className="h-4 w-4" /> {t("wf.newTemplate")}
      </Button>
      {sorted.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted">{t("wf.noTemplates")}</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((tpl) => (
            <Card key={tpl.id} className={cn("space-y-3 p-5", tpl.archived && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{tpl.name}</p>
                  {tpl.description && <p className="mt-0.5 text-sm text-muted">{tpl.description}</p>}
                </div>
                {tpl.archived && <Badge variant="neutral">{t("wf.archived")}</Badge>}
              </div>
              <ol className="space-y-1 text-sm text-muted">
                {tpl.steps.map((s, i) => (
                  <li key={s.id ?? i} className="flex gap-2">
                    <span className="w-5 shrink-0 tabular-nums">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{s.title}</span>
                    {(s.default_assignee_user_id || s.default_assignee_role) && (
                      <span className="shrink-0 truncate text-xs">
                        {staff.find((m) => m.id === s.default_assignee_user_id)?.name ?? s.default_assignee_role}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(tpl)} disabled={tpl.archived}>
                  <Pencil className="h-4 w-4" /> {t("wf.edit")}
                </Button>
                <Button size="sm" variant="ghost" loading={busy === tpl.id} onClick={() => setArchived(tpl, !tpl.archived)}>
                  {tpl.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  {tpl.archived ? t("wf.restore") : t("wf.archive")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
