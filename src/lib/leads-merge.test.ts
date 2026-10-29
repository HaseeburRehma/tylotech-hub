import { describe, expect, it } from "vitest";
import { changedSinceFilter, mergeLeads } from "./leads-shared";

type Row = { id: string; status: string; updated_at: string; last_activity_at: string; claimed_at?: string | null };
const row = (id: string, at: string, status = "new", claimed_at: string | null = null): Row => ({ id, status, updated_at: at, last_activity_at: at, claimed_at });

describe("mergeLeads", () => {
  const A = row("a", "2026-10-29T09:00:00Z");
  const B = row("b", "2026-10-29T09:01:00Z");

  it("adds new leads and reports them (for the 'Just in' highlight)", () => {
    const r = mergeLeads([A], [B]);
    expect(r.leads.map((l) => l.id)).toEqual(["a", "b"]);
    expect(r.added).toEqual(["b"]);
  });

  it("a lead seen by realtime and again by the catch-up is added once", () => {
    const first = mergeLeads([A], [B]);
    const again = mergeLeads(first.leads, [B]);
    expect(again.leads).toHaveLength(2);
    expect(again.added).toEqual([]);
    expect(again.leads).toBe(first.leads); // nothing changed → no re-render
  });

  it("a newer copy replaces the old one; a stale event can't undo it", () => {
    const contacted = row("a", "2026-10-29T09:05:00Z", "contacted");
    const r1 = mergeLeads([A, B], [contacted]);
    expect(r1.leads[0].status).toBe("contacted");
    const r2 = mergeLeads(r1.leads, [A]); // late realtime event with the old state
    expect(r2.leads[0].status).toBe("contacted");
  });

  it("a claim (only claimed_at moves) counts as newer", () => {
    const claimed = { ...A, claimed_at: "2026-10-29T09:00:30Z", status: "new" as const };
    expect(mergeLeads([A], [claimed]).leads[0].claimed_at).toBe("2026-10-29T09:00:30Z");
  });

  it("a burst of 200 leads keeps order and adds each once", () => {
    const many = Array.from({ length: 200 }, (_, i) => row(`n${i}`, `2026-10-29T09:${String(i % 60).padStart(2, "0")}:00Z`));
    const r = mergeLeads([A], [...many, ...many.slice(0, 50)]);
    expect(r.leads).toHaveLength(201);
    expect(r.added).toHaveLength(200);
  });

  it("nothing incoming → same array", () => {
    const list = [A];
    expect(mergeLeads(list, []).leads).toBe(list);
  });
});

describe("changedSinceFilter", () => {
  it("asks for new, edited, worked-on and claimed leads", () => {
    expect(changedSinceFilter("2026-10-29T09:00:00.000Z")).toBe(
      "received_at.gte.2026-10-29T09:00:00.000Z,updated_at.gte.2026-10-29T09:00:00.000Z,last_activity_at.gte.2026-10-29T09:00:00.000Z,claimed_at.gte.2026-10-29T09:00:00.000Z",
    );
  });
});
