import type { Project } from "@/types";

type AssigneeSource = Pick<Project, "assigned_to" | "assigned_to_id" | "assignee_ids">;

/** Staff ids on a project. Falls back to the single lead id before migration 0045. */
export function projectAssigneeIds(p: Partial<AssigneeSource>): string[] {
  if (p.assignee_ids?.length) return p.assignee_ids;
  return p.assigned_to_id ? [p.assigned_to_id] : [];
}

/** Display list of assignees: current staff names first, stored names for anyone no longer listed. */
export function projectAssignees(p: AssigneeSource, memberName: Record<string, string>): { key: string; name: string }[] {
  const stored = (p.assigned_to ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ids = projectAssigneeIds(p);
  if (!ids.length) return stored.map((name) => ({ key: name, name }));
  return ids.map((id, i) => ({ key: id, name: memberName[id] ?? stored[i] ?? "?" }));
}
