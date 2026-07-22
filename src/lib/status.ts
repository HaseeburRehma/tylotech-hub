import { ProjectStatus, UpdateType } from "@/types";

export const PROJECT_STATUS: Record<
  ProjectStatus,
  { label: string; variant: "neutral" | "info" | "warning" | "success" | "danger"; tone: "brand" | "info" | "warning" | "success" }
> = {
  planning: { label: "Planning", variant: "neutral", tone: "info" },
  in_progress: { label: "In Progress", variant: "info", tone: "brand" },
  review: { label: "In Review", variant: "warning", tone: "warning" },
  done: { label: "Done", variant: "success", tone: "success" },
  blocked: { label: "Blocked", variant: "danger", tone: "warning" },
};

export const UPDATE_META: Record<UpdateType, { label: string; variant: "brand" | "info" | "success" | "warning" | "danger" }> = {
  milestone: { label: "Milestone", variant: "success" },
  report: { label: "Report", variant: "info" },
  campaign: { label: "Campaign", variant: "brand" },
  note: { label: "Note", variant: "neutral" as never },
  alert: { label: "Alert", variant: "warning" },
};
