import { describe, expect, it } from "vitest";
import { projectAssigneeIds, projectAssignees } from "./projects";

const names = { a: "Anna", b: "Ben" };

describe("projectAssignees", () => {
  it("uses assignee_ids when present", () => {
    expect(projectAssignees({ assignee_ids: ["a", "b"], assigned_to_id: "a", assigned_to: "Anna, Ben" }, names).map((x) => x.name)).toEqual(["Anna", "Ben"]);
  });

  it("falls back to the lead id before migration 0045", () => {
    expect(projectAssigneeIds({ assigned_to_id: "a", assigned_to: "Anna" })).toEqual(["a"]);
  });

  it("keeps the stored name for someone no longer on the team", () => {
    expect(projectAssignees({ assignee_ids: ["a", "gone"], assigned_to_id: "a", assigned_to: "Anna, Old Name" }, names).map((x) => x.name)).toEqual(["Anna", "Old Name"]);
  });

  it("shows legacy name-only assignees and nothing for unassigned", () => {
    expect(projectAssignees({ assigned_to: "Ext 1, Ext 2", assigned_to_id: null }, names).map((x) => x.name)).toEqual(["Ext 1", "Ext 2"]);
    expect(projectAssignees({ assigned_to: "", assigned_to_id: null, assignee_ids: [] }, names)).toEqual([]);
  });
});
