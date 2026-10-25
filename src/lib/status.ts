import { ProjectStatus, UpdateType } from "@/types";

export const PROJECT_STATUS: Record<
  ProjectStatus,
  {
    label: string;
    variant: "neutral" | "brand" | "info" | "warning" | "positive" | "danger";
    tone: "brand" | "slate" | "positive" | "negative" | "muted";
    /** Status dot (Figma "Punkt") used in badges, board columns and pickers. */
    dot: string;
  }
> = {
  // Figma: in progress gold, review slate-blue, done teal, blocked rust.
  planning: { label: "proj.planning", variant: "neutral", tone: "muted", dot: "bg-muted/60" },
  in_progress: { label: "proj.inProgress", variant: "brand", tone: "brand", dot: "bg-brand" },
  review: { label: "proj.review", variant: "info", tone: "slate", dot: "bg-positive/50" },
  done: { label: "proj.done", variant: "positive", tone: "positive", dot: "bg-positive" },
  blocked: { label: "proj.blocked", variant: "danger", tone: "negative", dot: "bg-negative" },
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
