"use client";

import { CalendarDays, FolderKanban, User } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { PROJECT_STATUS } from "@/lib/status";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/types";

const ORDER: ProjectStatus[] = ["blocked", "in_progress", "review", "planning", "done"];

/** Read-only view of the work TyloTech is doing for this client. */
export function ProjectsView({ projects, staff }: { projects: Project[]; staff: boolean }) {
  const t = useT();
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...projects].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.due || "9999").localeCompare(b.due || "9999"),
  );
  const open = projects.filter((p) => p.status !== "done").length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("projects.title")} subtitle={t("projects.subtitle", { open, total: projects.length })}>
        {staff && (
          <Link href="/internal/projects" className="text-sm font-medium text-muted hover:text-foreground">
            {t("projects.manage")}
          </Link>
        )}
      </PageHeader>

      {sorted.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <FolderKanban className="h-10 w-10 text-muted/60" />
          <p className="text-sm text-muted">{t("dash.noProjects")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sorted.map((p) => {
            const s = PROJECT_STATUS[p.status];
            const overdue = p.status !== "done" && !!p.due && p.due < today;
            return (
              <Card key={p.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className={cn("text-base font-semibold", p.status === "done" && "text-muted line-through")}>{p.name}</h3>
                  <Badge variant={s.variant} className="shrink-0 text-[11px]">
                    {t(s.label)}
                  </Badge>
                </div>
                {p.description && <p className="whitespace-pre-line text-sm text-muted">{p.description}</p>}
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-muted">
                    <span>{t("projects.progress")}</span>
                    <span className="tabular-nums">{p.progress}%</span>
                  </div>
                  <Progress value={p.progress} tone={p.status === "done" ? "success" : s.tone} />
                </div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {p.assigned_to && (
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> {p.assigned_to}
                    </span>
                  )}
                  {p.due && (
                    <span className={cn("inline-flex items-center gap-1.5", overdue && "font-medium text-danger")}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(p.due).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
                      {overdue && ` · ${t("projects.overdue")}`}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
