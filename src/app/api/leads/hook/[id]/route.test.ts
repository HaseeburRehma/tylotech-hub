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

describe("tylotech.de website forms", () => {
  it("a contact form submission arrives with its answers, form, campaign and platform", async () => {
    source = { ...source, label: "Website / API", config: { provider: "website" } };
    const body = {
      form_name: "Kontaktformular",
      submission_id: "6b0f8f0e-1c1e-4f6e-9a55-0f2a1d6c9a11",
      submitted_at: "2026-10-30T12:00:00.000Z",
      utm_campaign: "Brand DE",
      utm_source: "google",
      fields: [
        { label: "Name", value: "Erika Muster" },
        { label: "E-Mail", value: "erika@example.de" },
        { label: "Telefon", value: "+49 170 1" },
        { label: "Nachricht", value: "Wir brauchen eine neue Website." },
        { label: "Seite", value: "/kontakt" },
        { label: "Google Klick-ID", value: "Cj0KCQ" },
      ],
    };
    const r = await post(JSON.stringify(body));
    expect(r.status).toBe(200);
    expect(ingest.mock.calls[0][1]).toMatchObject({
      clientId: "c1",
      source: "webhook",
      externalId: "6b0f8f0e-1c1e-4f6e-9a55-0f2a1d6c9a11",
      form: "Kontaktformular",
      campaign: "Brand DE",
      platform: "google",
      fields: body.fields,
    });
  });

  it("without UTM tags the lead's platform is the website; a retry keeps the same id", async () => {
    source = { ...source, config: { provider: "website" } };
    const body = { form_name: "App-Bauplan Bewerbung", submission_id: "same-id", fields: [{ label: "E-Mail", value: "a@b.de" }] };
    await post(JSON.stringify(body));
    await post(JSON.stringify(body));
    expect(ingest.mock.calls.map((c) => c[1].externalId)).toEqual(["same-id", "same-id"]); // stored once (unique per source + id)
    expect(ingest.mock.calls[0][1].platform).toBe("website");
  });

  it("someone posting to the URL without its key stores nothing", async () => {
    expect((await post(JSON.stringify({ form_name: "x", fields: [{ label: "E-Mail", value: "a@b.de" }] }), { key: "guess" })).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });
});
