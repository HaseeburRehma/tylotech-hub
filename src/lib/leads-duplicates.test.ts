import { describe, expect, it } from "vitest";
import { findDuplicates } from "./leads-shared";

let n = 0;
const lead = (p: { phone?: string | null; email?: string | null; at: string; test?: boolean }) => ({
  id: `l${++n}`,
  lead_no: n,
  phone: p.phone ?? null,
  email: p.email ?? null,
  created_at: p.at,
  is_test: !!p.test,
});

describe("findDuplicates", () => {
  it("same phone in any spelling, or same email (any case), points to the first lead", () => {
    const a = lead({ phone: "491738884095", email: "eva@t-online.de", at: "2026-10-28T10:52:03Z" });
    const b = lead({ phone: "+49 173 8884095", at: "2026-10-28T10:53:42Z" });
    const c = lead({ phone: "0173 8884095", at: "2026-10-28T11:00:00Z" });
    const d = lead({ email: "EVA@t-online.de ", at: "2026-10-28T12:00:00Z" });
    const other = lead({ phone: "0151 2345678", email: "max@example.de", at: "2026-10-28T12:30:00Z" });
    const dup = findDuplicates([d, c, other, b, a]);
    expect(dup.get(b.id)).toBe(a.lead_no);
    expect(dup.get(c.id)).toBe(a.lead_no);
    expect(dup.get(d.id)).toBe(a.lead_no);
    expect(dup.has(a.id) || dup.has(other.id)).toBe(false);
  });

  it("short numbers, empty fields and test leads never match", () => {
    const a = lead({ phone: "112", at: "2026-10-01T00:00:00Z" });
    const b = lead({ phone: "112", at: "2026-10-02T00:00:00Z" });
    const t = lead({ phone: "0151 2345678", at: "2026-10-01T00:00:00Z", test: true });
    const r = lead({ phone: "0151 2345678", at: "2026-10-03T00:00:00Z" });
    const e1 = lead({ email: "", at: "2026-10-01T00:00:00Z" });
    const e2 = lead({ email: "  ", at: "2026-10-02T00:00:00Z" });
    expect(findDuplicates([a, b, t, r, e1, e2]).size).toBe(0);
  });
});
