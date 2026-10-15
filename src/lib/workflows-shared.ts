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
  template_step_id?: string | null;
  due_offset_days?: number | null;
  status: StepStatus;
  due_date: string | null;
  note: string | null;
  activated_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  /** Files / links on this step (migration 0041); absent on older databases. */
  attachments?: StepAttachment[];
}
export interface StepAttachment {
  id: string;
  step_id: string;
  run_id: string;
  kind: "file" | "link";
  name: string;
  path: string | null;
  url: string | null;
  mime: string | null;
  size: number | null;
  document_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}
export type RepeatEvery = "week" | "month";
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
  /** Repeating runs (migration 0041): next round starts when this one finishes. */
  repeat_every?: RepeatEvery | null;
  repeated_from?: string | null;
  iteration?: number;
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

/** YYYY-MM-DD + one week / one month (calendar arithmetic in UTC). */
export function addInterval(date: string, every: "week" | "month"): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (every === "week") dt.setUTCDate(dt.getUTCDate() + 7);
  else {
    // Keep the day of month, clamped to the target month's length (31 Jan → 28/29 Feb).
    const day = dt.getUTCDate();
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(day, last));
  }
  return dt.toISOString().slice(0, 10);
}
