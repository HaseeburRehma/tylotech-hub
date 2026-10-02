"use client";

import { motion } from "framer-motion";
import {
  ArrowDownUp,
  CheckCircle2,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { NewProjectModal } from "@/components/modals/new-project-modal";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { useT } from "@/lib/i18n/provider";
import { PROJECT_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/types";
import type { TeamMember } from "@/lib/data";

type StatusFilter = "all" | ProjectStatus;
type SortKey = "due_asc" | "due_desc" | "name" | "progress";
const SORT_LABEL: Record<SortKey, string> = {
  due_asc: "proj.sortDue",
  due_desc: "proj.sortDueDesc",
  name: "proj.sortName",
  progress: "proj.sortProgress",
};
const dueTime = (d: string | null | undefined) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
const STATUSES: ProjectStatus[] = ["planning", "in_progress", "review", "done"];

const STATUS_LABEL_KEY: Record<ProjectStatus, string> = {
  planning: "proj.planning",
  in_progress: "proj.inProgress",
  review: "proj.review",
  done: "proj.done",
  blocked: "proj.planning",
};

export function ProjectsManager({
  projects,
  clients,
  members,
}: {
  projects: Project[];
  clients: { id: string; company: string }[];
  members: TeamMember[];
}) {
  const t = useT();
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("due_asc");
  const [view, setView] = useState<"list" | "board">("list");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const clientName = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.company])),
    [clients],
  );
  const memberName = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STATUSES) counts[s] = 0;
    for (const p of projects) {
      if (assignee !== "all" && (assignee === "none" ? !!p.assigned_to_id : p.assigned_to_id !== assignee)) continue;
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return counts;
  }, [projects, assignee]);

  const sorted = useMemo(() => {
    const list = [...projects];
    switch (sort) {
      case "due_desc":
        return list.sort((a, b) => {
          const [ta, tb] = [dueTime(a.due), dueTime(b.due)];
          if (ta === tb) return 0;
          if (!Number.isFinite(ta)) return 1;
          if (!Number.isFinite(tb)) return -1;
          return tb - ta;
        });
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "progress":
        return list.sort((a, b) => b.progress - a.progress);
      default:
        return list.sort((a, b) => dueTime(a.due) - dueTime(b.due));
    }
  }, [projects, sort]);

  const byAssignee = sorted.filter(
    (p) =>
      assignee === "all" ||
      (assignee === "none" ? !p.assigned_to_id : p.assigned_to_id === assignee),
  );
  const filtered = byAssignee.filter((p) => filter === "all" || p.status === filter);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const assigneeLabel =
    assignee === "all"
      ? t("proj.assigneeAll")
      : assignee === "none"
        ? t("proj.unassigned")
        : memberName[assignee] ?? t("proj.assigneeAll");

  const actions = (p: Project) => (
    <ProjectActions
      project={p}
      members={members}
      busy={busy === p.id}
      onPatch={(body) => patch(p.id, body)}
      onDelete={() => remove(p.id)}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("proj.title")} subtitle={t("proj.subtitle")}>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            {(
              [
                { key: "list" as const, icon: List, label: t("proj.list") },
                { key: "board" as const, icon: LayoutGrid, label: t("proj.board") },
              ]
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  view === key ? "bg-brand/10 font-medium text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("proj.newProject")}
          </Button>
        </div>
      </PageHeader>

      <NewProjectModal open={open} onClose={() => setOpen(false)} clients={clients} members={members} />

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {(
            [
              { key: "all" as StatusFilter, label: t("proj.all"), count: byAssignee.length },
              { key: "planning" as StatusFilter, label: t("proj.planning"), count: statusCounts.planning },
              { key: "in_progress" as StatusFilter, label: t("proj.inProgress"), count: statusCounts.in_progress },
              { key: "review" as StatusFilter, label: t("proj.review"), count: statusCounts.review },
              { key: "done" as StatusFilter, label: t("proj.done"), count: statusCounts.done },
            ]
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
                filter === p.key
                  ? "bg-brand/10 font-medium text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {p.label}
              <span className="ml-1.5 text-xs text-muted">{p.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Menu
            width={220}
            align="end"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:text-foreground",
                  assignee === "all" ? "text-muted" : "border-brand/40 text-foreground",
                )}
              >
                <Users className="h-3.5 w-3.5" />
                {assignee === "all" ? assigneeLabel : `${t("proj.col.assignee")}: ${assigneeLabel}`}
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem selected={assignee === "all"} onSelect={() => { setAssignee("all"); close(); }}>
                  {t("proj.all")}
                </MenuItem>
                <MenuItem selected={assignee === "none"} onSelect={() => { setAssignee("none"); close(); }}>
                  {t("proj.unassigned")}
                </MenuItem>
                <MenuSeparator />
                {members.map((m) => (
                  <MenuItem
                    key={m.id}
                    icon={<Avatar name={m.name} size={18} />}
                    selected={assignee === m.id}
                    onSelect={() => { setAssignee(m.id); close(); }}
                  >
                    {m.name}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          <Menu
            width={210}
            align="end"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                {t(SORT_LABEL[sort])}
              </button>
            )}
          >
            {(close) =>
              (Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <MenuItem key={k} selected={sort === k} onSelect={() => { setSort(k); close(); }}>
                  {t(SORT_LABEL[k])}
                </MenuItem>
              ))
            }
          </Menu>
        </div>
      </div>

      {view === "board" ? (
        <ProjectBoard
          projects={filtered}
          clientName={clientName}
          memberName={memberName}
          actions={actions}
          emptyLabel={t("proj.noProjects")}
        />
      ) : (
      <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("proj.col.project")}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("proj.col.client")}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("proj.col.status")}
              </th>
              <th className="hidden px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted md:table-cell">
                {t("proj.col.progress")}
              </th>
              <th className="hidden px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted lg:table-cell">
                {t("proj.col.assignee")}
              </th>
              <th className="hidden px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted md:table-cell">
                {t("proj.col.due")}
              </th>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const s = PROJECT_STATUS[p.status];
              const assignee = p.assigned_to_id
                ? memberName[p.assigned_to_id] ?? p.assigned_to
                : p.assigned_to;
              const cName = clientName[p.client_id] ?? "—";
              return (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group border-b border-border/50 last:border-0 hover:bg-surface-2/50"
                >
                  {/* Project name */}
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {p.name}
                      </p>
                      {p.description && (
                        <p className="mt-0.5 truncate text-xs text-muted">{p.description}</p>
                      )}
                    </div>
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={cName} size={28} />
                      <span className="truncate text-muted">{cName}</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        s.variant === "danger" ? "neutral" : s.variant
                      }
                      className="text-[10px]"
                    >
                      <span
                        className={cn(
                          "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                          {
                            "bg-muted": p.status === "planning",
                            "bg-brand": p.status === "in_progress",
                            "bg-warning": p.status === "review",
                            "bg-success": p.status === "done",
                            "bg-danger": p.status === "blocked",
                          },
                        )}
                      />
                      {t(STATUS_LABEL_KEY[p.status] ?? "proj.planning")}
                    </Badge>
                  </td>

                  {/* Progress */}
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="flex items-center gap-2">
                      <Progress
                        value={p.progress}
                        tone={s.tone}
                        className="w-20"
                      />
                      <span className="text-xs tabular-nums text-muted">
                        {p.progress} %
                      </span>
                    </div>
                  </td>

                  {/* Assignee */}
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {assignee ? (
                      <div className="flex -space-x-1.5">
                        {assignee.split(",").map((name) => (
                          <Avatar
                            key={name.trim()}
                            name={name.trim()}
                            size={28}
                            className="ring-2 ring-surface"
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  {/* Due date */}
                  <td className="hidden px-4 py-3 text-right text-xs text-muted md:table-cell">
                    {formatDue(p.due)}
                  </td>

                  {/* More */}
                  <td className="px-4 py-3 text-right">
                    {actions(p)}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-muted">
            {t("proj.noProjects")}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function formatDue(due: string | null | undefined) {
  return due
    ? new Date(due).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function ProjectActions({
  project,
  members,
  busy,
  onPatch,
  onDelete,
}: {
  project: Project;
  members: TeamMember[];
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);

  return (
    <Menu
      width={230}
      align="end"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          aria-label={t("proj.actions")}
          aria-expanded={open}
          disabled={busy}
          onClick={() => {
            setConfirm(false);
            toggle();
          }}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground",
            busy && "animate-pulse",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>{t("proj.col.status")}</MenuLabel>
          {STATUSES.map((s) => (
            <MenuItem
              key={s}
              selected={project.status === s}
              onSelect={() => {
                close();
                if (s !== project.status) onPatch({ status: s, ...(s === "done" ? { progress: 100 } : {}) });
              }}
            >
              {t(STATUS_LABEL_KEY[s])}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuLabel>{t("proj.col.progress")}</MenuLabel>
          <div className="grid grid-cols-5 gap-1 px-1.5 pb-1">
            {[0, 25, 50, 75, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  close();
                  if (v !== project.progress) onPatch({ progress: v });
                }}
                className={cn(
                  "rounded-md py-1 text-xs tabular-nums transition-colors",
                  project.progress === v ? "bg-brand/15 font-medium text-foreground" : "text-muted hover:bg-surface-2",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <MenuSeparator />
          <MenuLabel>{t("proj.col.assignee")}</MenuLabel>
          <MenuItem
            icon={<UserRound className="h-4 w-4" />}
            selected={!project.assigned_to_id}
            onSelect={() => {
              close();
              if (project.assigned_to_id) onPatch({ assignedToId: null, assignedToName: null });
            }}
          >
            {t("proj.unassigned")}
          </MenuItem>
          {members.map((m) => (
            <MenuItem
              key={m.id}
              icon={<Avatar name={m.name} size={18} />}
              selected={project.assigned_to_id === m.id}
              onSelect={() => {
                close();
                if (project.assigned_to_id !== m.id) onPatch({ assignedToId: m.id, assignedToName: m.name });
              }}
            >
              {m.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          {project.status !== "done" && (
            <MenuItem
              icon={<CheckCircle2 className="h-4 w-4" />}
              onSelect={() => {
                close();
                onPatch({ status: "done", progress: 100 });
              }}
            >
              {t("proj.markDone")}
            </MenuItem>
          )}
          <MenuItem
            danger
            icon={<Trash2 className="h-4 w-4 text-danger" />}
            onSelect={() => {
              if (!confirm) return setConfirm(true);
              close();
              onDelete();
            }}
          >
            {confirm ? t("proj.confirmDelete") : t("proj.delete")}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

function ProjectBoard({
  projects,
  clientName,
  memberName,
  actions,
  emptyLabel,
}: {
  projects: Project[];
  clientName: Record<string, string>;
  memberName: Record<string, string>;
  actions: (p: Project) => React.ReactNode;
  emptyLabel: string;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map((status) => {
        const items = projects.filter((p) => p.status === status);
        const s = PROJECT_STATUS[status];
        return (
          <div key={status} className="flex flex-col rounded-xl border border-border bg-surface-2/40 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                {t(STATUS_LABEL_KEY[status])}
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-muted">{items.length}</span>
            </div>
            <div className="space-y-2.5">
              {items.map((p) => {
                const assignee = p.assigned_to_id ? memberName[p.assigned_to_id] ?? p.assigned_to : p.assigned_to;
                const cName = clientName[p.client_id] ?? "—";
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-surface p-3.5 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug text-foreground">{p.name}</p>
                      {actions(p)}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                      <Avatar name={cName} size={18} />
                      <span className="truncate">{cName}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Progress value={p.progress} tone={s.tone} className="flex-1" />
                      <span className="text-[11px] tabular-nums text-muted">{p.progress} %</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                      <span>{formatDue(p.due)}</span>
                      {assignee ? <Avatar name={assignee.split(",")[0].trim()} size={22} /> : <span>—</span>}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted">
                  {emptyLabel}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
