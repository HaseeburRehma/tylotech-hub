import { describe, expect, it } from "vitest";
import { normalizeLeadPayload, unflattenBrackets } from "./lead-payload";
import { pickContact } from "./leads-shared";

const contact = (p: ReturnType<typeof normalizeLeadPayload>) => pickContact(p.fields);
const labels = (p: ReturnType<typeof normalizeLeadPayload>) => p.fields.map((f) => f.label);

// Shapes of each tool's webhook (made-up people).
describe("form tools", () => {
  it("Typeform: answers get their question titles; choices and hidden fields", () => {
    const p = normalizeLeadPayload("typeform", {
      event_id: "01HX",
      form_response: {
        token: "tok123",
        submitted_at: "2026-10-29T09:12:00Z",
        hidden: { utm_source: "facebook", utm_campaign: "Herbst" },
        definition: { title: "Beratung anfragen", fields: [{ id: "a", title: "Wie heißt du?" }, { id: "b", title: "E-Mail" }, { id: "c", title: "Telefon" }, { id: "d", title: "Thema" }] },
        answers: [
          { type: "text", text: "Erika Muster", field: { id: "a", type: "short_text" } },
          { type: "email", email: "erika@example.de", field: { id: "b", type: "email" } },
          { type: "phone_number", phone_number: "+491701234567", field: { id: "c", type: "phone_number" } },
          { type: "choices", choices: { labels: ["Heizung", "Bad"] }, field: { id: "d", type: "multiple_choice" } },
        ],
      },
    });
    expect(p).toMatchObject({ externalId: "tok123", createdAt: "2026-10-29T09:12:00Z", form: "Beratung anfragen", campaign: "Herbst", platform: "facebook" });
    expect(p.fields).toContainEqual({ label: "Thema", value: "Heizung, Bad" });
    expect(contact(p)).toEqual({ name: "Erika Muster", email: "erika@example.de", phone: "+491701234567" });
  });

  it("Tally: option ids become the option text; utm fields become lead details", () => {
    const p = normalizeLeadPayload("tally", {
      eventId: "e1",
      eventType: "FORM_RESPONSE",
      createdAt: "2026-10-29T09:00:00Z",
      data: {
        responseId: "r1",
        formName: "Rückruf",
        createdAt: "2026-10-29T08:59:59Z",
        fields: [
          { key: "q1", label: "Name", type: "INPUT_TEXT", value: "Max Probe" },
          { key: "q2", label: "E-Mail", type: "INPUT_EMAIL", value: "max@example.de" },
          { key: "q3", label: "Wann erreichbar?", type: "MULTIPLE_CHOICE", value: ["o2"], options: [{ id: "o1", text: "Vormittags" }, { id: "o2", text: "Abends" }] },
          { key: "q4", label: "utm_campaign", type: "HIDDEN_FIELDS", value: "winter" },
        ],
      },
    });
    expect(p).toMatchObject({ externalId: "r1", form: "Rückruf", campaign: "winter", createdAt: "2026-10-29T08:59:59Z" });
    expect(p.fields).toContainEqual({ label: "Wann erreichbar?", value: "Abends" });
    expect(labels(p)).not.toContain("Utm campaign");
    expect(contact(p).name).toBe("Max Probe");
  });

  it("Jotform: answers from rawRequest, q3_ prefixes dropped, name parts joined", () => {
    const p = normalizeLeadPayload("jotform", {
      formTitle: "Kontakt",
      submissionID: "5678",
      rawRequest: JSON.stringify({ slug: "x", q3_name: { first: "Lena", last: "Beispiel" }, q4_email: "lena@example.de", q5_telefon: "0151 2345678", event_id: "zz" }),
    });
    expect(p).toMatchObject({ externalId: "5678", form: "Kontakt", platform: "jotform" });
    expect(contact(p)).toEqual({ name: "Lena Beispiel", email: "lena@example.de", phone: "0151 2345678" });
  });

  it("Heyflow / Perspective style: question/answer lists", () => {
    const p = normalizeLeadPayload("heyflow", {
      flowID: "flow-1",
      id: "sub-9",
      createdAt: "2026-10-29T08:00:00Z",
      values: [
        { question: "Vorname", answer: "Jonas" },
        { question: "Nachname", answer: "Test" },
        { question: "E-Mail", answer: "jonas@example.de" },
        { question: "Budget", answer: ["5.000 €", "10.000 €"] },
      ],
    });
    expect(p).toMatchObject({ externalId: "sub-9", createdAt: "2026-10-29T08:00:00Z", platform: "heyflow" });
    expect(contact(p)).toMatchObject({ name: "Jonas Test", email: "jonas@example.de" });
    expect(p.fields).toContainEqual({ label: "Budget", value: "5.000 €, 10.000 €" });
  });

  it("Webflow: payload.data answers; the form's name is the form, not the person", () => {
    const p = normalizeLeadPayload("webflow", {
      triggerType: "form_submission",
      payload: { name: "Kontaktformular", siteId: "s1", id: "w1", submittedAt: "2026-10-29T07:00:00Z", data: { Name: "Paula Probe", Email: "paula@example.de", Nachricht: "Bitte Rückruf" } },
    });
    expect(p).toMatchObject({ externalId: "w1", form: "Kontaktformular", createdAt: "2026-10-29T07:00:00Z" });
    expect(contact(p)).toMatchObject({ name: "Paula Probe", email: "paula@example.de" });
    expect(p.fields.map((f) => f.value)).not.toContain("Kontaktformular");
  });

  it("Elementor (form post with brackets): titles as labels; IP and browser are dropped", () => {
    const p = normalizeLeadPayload("wordpress", {
      "form[id]": "abc",
      "form[name]": "Anfrage",
      "fields[name][title]": "Name",
      "fields[name][value]": "Tom Tester",
      "fields[email][title]": "E-Mail",
      "fields[email][value]": "tom@example.de",
      "fields[tel][title]": "Telefon",
      "fields[tel][value]": "0170 9999999",
      "meta[remote_ip][value]": "203.0.113.7",
      "meta[user_agent][value]": "Mozilla/5.0",
    });
    expect(p.form).toBe("Anfrage");
    expect(contact(p)).toEqual({ name: "Tom Tester", email: "tom@example.de", phone: "0170 9999999" });
    expect(JSON.stringify(p.fields)).not.toMatch(/203\.0\.113\.7|Mozilla/);
  });

  it("Zapier / Make / plain website JSON: flat keys, secrets never become answers", () => {
    const p = normalizeLeadPayload("zapier", { full_name: "Anna Muster", email: "anna@example.de", phone: "+49 170 1", message: "Hallo", key: "SECRET", utm_campaign: "Q4", lead_id: "z1", is_test: true });
    expect(p).toMatchObject({ externalId: "z1", campaign: "Q4", isTest: true, platform: "zapier" });
    expect(JSON.stringify(p.fields)).not.toContain("SECRET");
    expect(contact(p)).toMatchObject({ name: "Anna Muster", email: "anna@example.de" });
  });

  it("LinkedIn lead form via Make (nested contact block)", () => {
    const p = normalizeLeadPayload("make", { platform: "linkedin", lead: { contact: { firstName: "Ole", lastName: "Probe", emailAddress: "ole@example.de" }, company: "Probe GmbH" }, submittedAt: "2026-10-29T06:00:00Z" });
    expect(p).toMatchObject({ platform: "linkedin", createdAt: "2026-10-29T06:00:00Z" });
    expect(contact(p).email).toBe("ole@example.de");
    expect(p.fields).toContainEqual({ label: "Company", value: "Probe GmbH" });
  });
});

describe("robustness", () => {
  it("caps the number of answers and the length of each", () => {
    const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`f${i}`, "x".repeat(10_000)]));
    const p = normalizeLeadPayload("website", big);
    expect(p.fields.length).toBe(80);
    expect(Math.max(...p.fields.map((f) => f.value.length))).toBe(4000);
  });
  it("deep or odd nesting doesn't throw; empty bodies give no answers", () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 50; i++) cur = (cur.x = {}) as Record<string, unknown>;
    expect(() => normalizeLeadPayload("website", deep)).not.toThrow();
    expect(normalizeLeadPayload("website", {}).fields).toEqual([]);
    expect(() => normalizeLeadPayload("typeform", { form_response: { answers: "nope" } })).not.toThrow();
    expect(normalizeLeadPayload("jotform", { rawRequest: "{not json" }).fields).toEqual([]);
  });
  it("brackets: prototype keys can't pollute objects", () => {
    unflattenBrackets({ "__proto__[polluted]": "yes", "a[b]": "c" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("names asked as questions", () => {
  it("“Wie heißt du?”, “Ihr vollständiger Name”, “Your full name” are the person's name; company names aren't", () => {
    for (const q of ["Wie heißt du?", "Wie heißen Sie?", "Ihr vollständiger Name", "Your full name", "Vor- und Nachname"]) {
      expect(pickContact([{ label: q, value: "Erika Muster" }]).name).toBe("Erika Muster");
    }
    expect(pickContact([{ label: "Name Ihrer Firma", value: "Muster GmbH" }]).name).toBeNull();
    expect(pickContact([{ label: "Your full name", value: "erika@example.de" }]).name).toBeNull();
  });
});

