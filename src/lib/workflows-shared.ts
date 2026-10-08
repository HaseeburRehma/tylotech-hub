/**
 * Workflow types + pure helpers, safe for client components.
 * Server-side engine wrappers live in src/lib/workflows.ts.
 */

export type StepStatus = "locked" | "active" | "done" | "skipped";
export type RunStatus = "active" | "completed" | "paused";

export interface TemplateStep {
  id?: string;
  order_index: number;
  title: string;
  instructions: string | null;
  default_assignee_role: string | null;
  default_assignee_user_id: string | null;
  due_offset_days: number | null;
}
export interface Template {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  updated_at: string;
  steps: TemplateStep[];
}
export interface RunStep {
  id: string;
  run_id: string;
  order_index: number;
  title: string;
  instructions: string | null;
  assignee_user_id: string | null;
  status: StepStatus;
  due_date: string | null;
  note: string | null;
  activated_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
}
export interface Run {
  id: string;
  template_id: string | null;
  name: string;
  context_type: "partner" | "project";
  context_id: string;
  client_id: string | null;
  status: RunStatus;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  steps: RunStep[];
}
export interface StaffOption {
  id: string;
  name: string;
  title: string | null;
  role: string;
}

/** Progress shown on cards and the board: finished (done or skipped) of total. */
export function runProgress(steps: Pick<RunStep, "status">[]) {
  const total = steps.length;
  const finished = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  return { finished, total, pct: total ? Math.round((finished / total) * 100) : 0 };
}

export const activeStep = <T extends Pick<RunStep, "status">>(steps: T[]) => steps.find((s) => s.status === "active") ?? null;

/** Today's date in Berlin (the team's calendar day), as YYYY-MM-DD. */
export const berlinToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

/** Due today or earlier counts as overdue only once the day has passed. */
export function isOverdue(step: Pick<RunStep, "status" | "due_date">, today = berlinToday()) {
  return step.status === "active" && !!step.due_date && step.due_date < today;
}

/**
 * Default assignee for a template step: a fixed person wins, otherwise the
 * first active staff member whose title matches the role (case-insensitive).
 */
export function resolveDefaultAssignee(step: Pick<TemplateStep, "default_assignee_user_id" | "default_assignee_role">, staff: StaffOption[]) {
  if (step.default_assignee_user_id && staff.some((s) => s.id === step.default_assignee_user_id)) return step.default_assignee_user_id;
  const role = step.default_assignee_role?.trim().toLowerCase();
  if (!role) return null;
  return staff.find((s) => (s.title ?? "").trim().toLowerCase() === role)?.id ?? null;
}
