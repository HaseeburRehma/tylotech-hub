import { describe, expect, it } from "vitest";
import { activeStep, addInterval, isOverdue, resolveDefaultAssignee, runProgress, type StaffOption } from "./workflows-shared";

const staff: StaffOption[] = [
  { id: "a", name: "Abdul", title: "SEO Expert", role: "team" },
  { id: "i", name: "Ilias", title: "Founder / Strategy", role: "admin" },
];

describe("resolveDefaultAssignee", () => {
  it("prefers a fixed default person", () => {
    expect(resolveDefaultAssignee({ default_assignee_user_id: "i", default_assignee_role: "SEO Expert" }, staff)).toBe("i");
  });
  it("matches the role to a staff title, case-insensitively", () => {
    expect(resolveDefaultAssignee({ default_assignee_user_id: null, default_assignee_role: " seo expert " }, staff)).toBe("a");
  });
  it("falls back to the role when the fixed person left", () => {
    expect(resolveDefaultAssignee({ default_assignee_user_id: "gone", default_assignee_role: "SEO Expert" }, staff)).toBe("a");
  });
  it("returns null when nobody matches", () => {
    expect(resolveDefaultAssignee({ default_assignee_user_id: null, default_assignee_role: "Copywriter" }, staff)).toBeNull();
    expect(resolveDefaultAssignee({ default_assignee_user_id: null, default_assignee_role: null }, staff)).toBeNull();
  });
});

describe("runProgress / activeStep / isOverdue", () => {
  const steps = [{ status: "done" as const }, { status: "skipped" as const }, { status: "active" as const }, { status: "locked" as const }, { status: "locked" as const }];
  it("counts done and skipped as finished", () => {
    expect(runProgress(steps)).toEqual({ finished: 2, total: 5, pct: 40 });
    expect(runProgress([])).toEqual({ finished: 0, total: 0, pct: 0 });
  });
  it("finds the single active step", () => {
    expect(activeStep(steps)).toBe(steps[2]);
    expect(activeStep([{ status: "done" as const }])).toBeNull();
  });
  it("is overdue only for an active step after its due day", () => {
    expect(isOverdue({ status: "active", due_date: "2026-10-06" }, "2026-10-07")).toBe(true);
    expect(isOverdue({ status: "active", due_date: "2026-10-07" }, "2026-10-07")).toBe(false);
    expect(isOverdue({ status: "locked", due_date: "2026-10-01" }, "2026-10-07")).toBe(false);
    expect(isOverdue({ status: "active", due_date: null }, "2026-10-07")).toBe(false);
  });
});

describe("addInterval", () => {
  it("adds a week across month and year ends", () => {
    expect(addInterval("2026-10-14", "week")).toBe("2026-10-21");
    expect(addInterval("2026-12-28", "week")).toBe("2027-01-04");
  });
  it("adds a month and clamps to the last day", () => {
    expect(addInterval("2026-10-14", "month")).toBe("2026-11-14");
    expect(addInterval("2027-01-31", "month")).toBe("2027-02-28");
    expect(addInterval("2028-01-31", "month")).toBe("2028-02-29");
    expect(addInterval("2026-12-15", "month")).toBe("2027-01-15");
  });
});
