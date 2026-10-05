import { ProjectStatus, UpdateType } from "@/types";

export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; variant: "neutral" | "info" | "warning" | "success" | "danger"; tone: "brand" | "info" | "warning" | "success" }
> = {
  planning: { label: "proj.planning", variant: "neutral", tone: "info" },
  in_progress: { label: "proj.inProgress", variant: "info", tone: "brand" },
  review: { label: "proj.review", variant: "warning", tone: "warning" },
  done: { label: "proj.done", variant: "success", tone: "success" },
  blocked: { label: "proj.blocked", variant: "danger", tone: "warning" },
};

export const UPDATE_META: Record<UpdateType, { label: string; variant: "brand" | "info" | "success" | "warning" | "danger" }> = {
  milestone: { label: "upd.type.milestone", variant: "success" },
  report: { label: "upd.type.report", variant: "info" },
  campaign: { label: "upd.type.campaign", variant: "brand" },
  note: { label: "upd.type.note", variant: "neutral" as never },
  alert: { label: "upd.type.alert", variant: "warning" },
};

/** KPIs where a decrease is an improvement (cheaper leads, better ranking). */
export const LOWER_IS_BETTER = new Set(["cpl", "avg_position"]);

/** A KPI change worth showing as a badge — hides "no comparison" and 0 %. */
export function shownDelta(delta: number | null | undefined): number | undefined {
  return delta == null || delta === 0 || !Number.isFinite(delta) ? undefined : delta;
}
