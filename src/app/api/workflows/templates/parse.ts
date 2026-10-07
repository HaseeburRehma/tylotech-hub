import { UUID_RE } from "../_shared";

export interface StepRow {
  order_index: number;
  title: string;
  instructions: string | null;
  default_assignee_role: string | null;
  default_assignee_user_id: string | null;
  due_offset_days: number | null;
}

/** Validate the editor's step list (order = array order). */
export function parseSteps(input: unknown): { rows: StepRow[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "A template needs at least one step." };
  if (input.length > 50) return { error: "A template can have at most 50 steps." };
  const rows: StepRow[] = [];
  for (let i = 0; i < input.length; i++) {
    const s = (input[i] ?? {}) as Record<string, unknown>;
    const title = String(s.title ?? "").trim();
    if (!title || title.length > 160) return { error: `Step ${i + 1}: title must be 1–160 characters.` };
    const offset = s.dueOffsetDays === null || s.dueOffsetDays === undefined || s.dueOffsetDays === "" ? null : Number(s.dueOffsetDays);
    if (offset !== null && (!Number.isInteger(offset) || offset < 0 || offset > 365)) return { error: `Step ${i + 1}: due offset must be 0–365 days.` };
    const userId = s.defaultAssigneeUserId ? String(s.defaultAssigneeUserId) : null;
    if (userId && !UUID_RE.test(userId)) return { error: `Step ${i + 1}: invalid default person.` };
    rows.push({
      order_index: i,
      title,
      instructions: String(s.instructions ?? "").trim().slice(0, 4000) || null,
      default_assignee_role: String(s.defaultAssigneeRole ?? "").trim().slice(0, 80) || null,
      default_assignee_user_id: userId,
      due_offset_days: offset,
    });
  }
  return { rows };
}
