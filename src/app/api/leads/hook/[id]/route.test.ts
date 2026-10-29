import { beforeEach, describe, expect, it, vi } from "vitest";

const SRC_ID = "8f14e45f-ceea-467a-a8f5-0b3c2a9d1e11";
let source: any;
const ingest = vi.fn();
vi.mock("@/lib/leads", () => ({
  UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ingestLead: (...a: unknown[]) => ingest(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: source }) }) }), update: () => ({ eq: async () => ({}) }) }) }),
}));
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: async () => ({ success: true }) }) }));

import { POST } from "./route";

const post = (body: string, { key = "k3y", type = "application/json", id = SRC_ID } = {}) =>
  POST(new Request(`https://www.tylohq.de/api/leads/hook/${id}?key=${key}`, { method: "POST", headers: { "content-type": type }, body }), { params: { id } });

beforeEach(() => {
  source = { id: SRC_ID, client_id: "c1", kind: "webhook", secret: "k3y", label: "Typeform", config: { provider: "typeform" } };
  ingest.mockReset().mockResolvedValue({ id: "l1", lead_no: 42 });
});

describe("/api/leads/hook/:id", () => {
  it("a Typeform submission arrives with its question titles and form name", async () => {
    const r = await post(
      JSON.stringify({ form_response: { token: "t1", submitted_at: "2026-10-29T09:00:00Z", definition: { title: "Beratung", fields: [{ id: "a", title: "E-Mail" }] }, answers: [{ type: "email", email: "erika@example.de", field: { id: "a" } }] } }),
    );
    expect(await r.json()).toEqual({ ok: true, lead_no: 42, duplicate: false });
    expect(ingest.mock.calls[0][1]).toMatchObject({ clientId: "c1", source: "webhook", sourceId: SRC_ID, externalId: "t1", form: "Beratung", platform: "typeform", fields: [{ label: "E-Mail", value: "erika@example.de" }] });
  });

  it("form posts (Elementor) are read too", async () => {
    source.config = { provider: "wordpress" };
    const body = new URLSearchParams({ "fields[email][title]": "E-Mail", "fields[email][value]": "tom@example.de", "form[name]": "Anfrage" }).toString();
    const r = await post(body, { type: "application/x-www-form-urlencoded" });
    expect(r.status).toBe(200);
    expect(ingest.mock.calls[0][1]).toMatchObject({ form: "Anfrage", fields: [{ label: "E-Mail", value: "tom@example.de" }] });
  });

  it("wrong or missing key, unknown or Meta sources: nothing stored", async () => {
    expect((await post("{}", { key: "nope" })).status).toBe(401);
    expect((await post("{}", { key: "" })).status).toBe(401);
    expect((await post("{}", { id: "not-a-uuid" })).status).toBe(404);
    source = { ...source, kind: "meta" };
    expect((await post(JSON.stringify({ email: "a@b.de" }))).status).toBe(404);
    source = { ...source, kind: "webhook", secret: null };
    expect((await post(JSON.stringify({ email: "a@b.de" }))).status).toBe(404);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("too large, broken JSON or empty: refused", async () => {
    expect((await post(JSON.stringify({ x: "y".repeat(300 * 1024) }))).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect((await post("[1,2]")).status).toBe(400);
    expect((await post(JSON.stringify({ key: "k3y" }))).status).toBe(400); // only the key, no answers
    expect(ingest).not.toHaveBeenCalled();
  });
});
