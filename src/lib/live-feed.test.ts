import { describe, expect, it } from "vitest";
import { emitActivity, joinDetail, leadsTitle, serializePublicFeed, type ActivityRow } from "./live-feed";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const row = (o: Partial<ActivityRow> = {}): ActivityRow => ({
  id: "0f8e2c1a-1111-4222-8333-944455556666",
  kind: "leads",
  title: "3 neue Leads",
  detail: "Meta Ads · Fahrschule · Düsseldorf",
  occurred_at: new Date(NOW - 10 * 60_000).toISOString(),
  ...o,
});

describe("serializePublicFeed", () => {
  it("outputs exactly the five public fields", () => {
    const [e] = serializePublicFeed([{ ...row(), client_id: "secret", source: "meta_ads", source_ref: "x" } as ActivityRow], NOW);
    expect(Object.keys(e).sort()).toEqual(["detail", "id", "kind", "occurredAt", "title"]);
  });

  it("omits an empty detail", () => {
    const [e] = serializePublicFeed([row({ detail: null })], NOW);
    expect("detail" in e).toBe(false);
  });

  it("drops invalid rows", () => {
    const out = serializePublicFeed(
      [
        row({ id: "a", kind: "spam" }),
        row({ id: "b", title: "x".repeat(81) }),
        row({ id: "c", title: "   " }),
        row({ id: "d", detail: "y".repeat(81) }),
        row({ id: "e", occurred_at: new Date(NOW - 25 * 3600_000).toISOString() }),
        row({ id: "f", occurred_at: new Date(NOW + 5 * 60_000).toISOString() }),
        row({ id: "g", occurred_at: "not a date" }),
        row({ id: "ok" }),
      ],
      NOW,
    );
    expect(out.map((e) => e.id)).toEqual(["ok"]);
  });

  it("sorts newest first and caps at 20", () => {
    const rows = Array.from({ length: 25 }, (_, i) => row({ id: `id-${i}`, occurred_at: new Date(NOW - i * 60_000).toISOString() }));
    const out = serializePublicFeed(rows.reverse(), NOW);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe("id-0");
  });
});

describe("helpers", () => {
  it("leadsTitle", () => {
    expect(leadsTitle(1)).toBe("1 neuer Lead");
    expect(leadsTitle(4)).toBe("4 neue Leads");
  });
  it("joinDetail skips empty parts and trims to 80", () => {
    expect(joinDetail("Meta Ads", null, " Fahrschule · Düsseldorf ")).toBe("Meta Ads · Fahrschule · Düsseldorf");
    expect(joinDetail(undefined, "")).toBeUndefined();
    expect(joinDetail("z".repeat(100))).toHaveLength(80);
  });
});

/* Minimal stand-in for the Supabase client that honours ON CONFLICT DO NOTHING. */
function fakeAdmin(label: string | null = "Fahrschule · Düsseldorf") {
  const rows: Record<string, unknown>[] = [];
  const client = {
    rows,
    from(table: string) {
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { public_feed_label: label } }) }) }) };
      }
      return {
        upsert: async (r: Record<string, unknown>, opts: { onConflict: string; ignoreDuplicates: boolean }) => {
          const dup = rows.some((x) => x.source === r.source && x.source_ref === r.source_ref);
          if (!dup || !opts.ignoreDuplicates) rows.push(r);
          return { error: null };
        },
      };
    },
  };
  return client;
}

describe("emitActivity", () => {
  const base = { clientId: "c1", kind: "leads" as const, title: "2 neue Leads", occurredAt: new Date(NOW), source: "meta_ads" as const, sourceRef: "metric_points:c1:2026-10-05:meta_ads:leads=7" };

  it("is idempotent on (source, sourceRef)", async () => {
    const admin = fakeAdmin();
    await emitActivity(admin as never, base);
    await emitActivity(admin as never, base);
    expect(admin.rows).toHaveLength(1);
  });

  it("defaults detail to the client's public label", async () => {
    const admin = fakeAdmin("Gebäudereinigung · Köln");
    await emitActivity(admin as never, base);
    expect(admin.rows[0].detail).toBe("Gebäudereinigung · Köln");
  });

  it("rejects invalid input without throwing", async () => {
    const admin = fakeAdmin();
    expect((await emitActivity(admin as never, { ...base, title: " " })).ok).toBe(false);
    expect((await emitActivity(admin as never, { ...base, kind: "spam" as never })).ok).toBe(false);
    expect(admin.rows).toHaveLength(0);
  });
});
