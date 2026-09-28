"use client";

import { motion } from "framer-motion";
import {
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
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
import { useT } from "@/lib/i18n/provider";
import { PROJECT_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/types";
import type { TeamMember } from "@/lib/data";

type StatusFilter = "all" | ProjectStatus;
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
  const [open, setOpen] = useState(false);

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
    for (const p of projects) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [projects]);

  const sorted = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
      ),
    [projects],
  );

  const filtered = sorted.filter(
    (p) => filter === "all" || p.status === filter,
  );

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("proj.title")} subtitle={t("proj.subtitle")}>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            <button className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-medium text-foreground">
              <List className="h-3.5 w-3.5" />
              {t("proj.list")}
            </button>
            <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors">
              <LayoutGrid className="h-3.5 w-3.5" />
              {t("proj.board")}
            </button>
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
        <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          {(
            [
              { key: "all" as StatusFilter, label: t("proj.all"), count: projects.length },
              { key: "planning" as StatusFilter, label: t("proj.planning"), count: statusCounts.planning },
              { key: "in_progress" as StatusFilter, label: t("proj.inProgress"), count: statusCounts.in_progress },
              { key: "review" as StatusFilter, label: t("proj.review"), count: statusCounts.review },
              { key: "done" as StatusFilter, label: t("proj.done"), count: statusCounts.done },
            ]
          ).map((p) => (
            <button
              key={p.key}
              onClick={() => setFilter(p.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
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
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors">
            <Users className="h-3.5 w-3.5" />
            {t("proj.assigneeAll")}
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
            {t("proj.sortDue")}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
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
                    {p.due
                      ? new Date(p.due).toLocaleDateString("de-DE", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>

                  {/* More */}
                  <td className="px-4 py-3 text-right">
                    <button className="inline-flex items-center text-muted transition-colors hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
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
    </div>
  );
}
