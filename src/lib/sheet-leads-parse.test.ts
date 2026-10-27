import { describe, expect, it } from "vitest";
import { leadFingerprint, looksLikeLeadTab, mergeSheetLeads, parseSheetDate, spreadsheetIdFrom, tabToLeads, zonedToIso } from "./sheet-leads-parse";

const TZ = "Europe/Berlin";

// Shapes of the Light of Hope sheet (Oct 2026), with made-up people.
const GOOGLE_TAB = [
  ["Datum", "Vorname", "Nachname", "Telefon", "Email", "Seite", "Frage1_Themen", "Formular", "gclid", "LeadID", "em", "fbp", "Status"],
  ["27.10.2026, 09:16:39", "Erika", "Muster", "0151 2345678", "Erika@Example.de", "https://www.example.org/sofort?gad_source=1&gclid=abc", "Angst oder Panik", "", "abc", "lead_1793089135785_3luge0rbi", "f00", "fb.1", ""],
  ["26.10.2026, 08:01:29", "Max", "Probe", "0170 1111111", "max@example.de", "https://www.example.org/sofort", "Trauma", "Rueckruf Popup", "", "lead_1793000000000_aaaaaaaaa", "", "", "abgeschlossen"],
];
const ALL_TAB = [
  ["", "Zeitstempel", "Status", "Vorname", "Nachname", "Telefon", "Email", "Seite", "gclid", "Frage1_Themen", "Frage2_Dringlichkeit"],
  ["lead_1793089135785_3luge0rbi", "2026-10-27 9:18:58", "Vollständig", "Erika", "Muster", "0151 2345678", "erika@example.de", "https://www.example.org/sofort", "abc", "Angst oder Panik", "Sofort"],
  ["lead_1793011740009_kxamjxvk9", "2026-10-26 11:49:01", "Teil-Lead", "Jonas", "", "0160 2222222", "", "https://www.example.org/online", "", "Depression", ""],
  ["lead_1793009903895_jaaqrmdjs", "2026-10-26 11:18:25", "Teil-Lead (anonym)", "", "", "", "", "https://www.example.org/online", "", "Stress", ""],
];
const RETREAT_TAB = [
  ["LeadID", "Zeitstempel", "Status", "Letzter Schritt", "Vorname", "Nachname", "E-Mail", "Telefon", "Wohnort", "01 Warum gerade jetzt", "ext_id", "fbclid", "utm_campaign", "E-Mail gesendet"],
  ["341116fe-bc67-49e9-a33e-b4b7e55e0001", "2026-10-27 11:10:20", "Teil-Bewerbung", "10", "Lena", "Beispiel", "lena@example.de", "", "Köln", "Weil es Zeit ist", "x1", "IwAR123", "retreat_okt", "ja"],
  ["341116fe-bc67-49e9-a33e-b4b7e55e0002", "2026-10-25 23:33:05", "", "1", "", "", "", "", "", "", "x2", "", "", ""],
];

describe("dates", () => {
  it("reads German and ISO-like text in the sheet's zone (CET after the clock change)", () => {
    expect(parseSheetDate("27.10.2026, 09:16:39", TZ)).toBe("2026-10-27T08:16:39.000Z");
    expect(parseSheetDate("2026-10-27 9:18:58", TZ)).toBe("2026-10-27T08:18:58.000Z");
    // Summer time (CEST, UTC+2).
    expect(parseSheetDate("01.07.2026, 12:00:00", TZ)).toBe("2026-07-01T10:00:00.000Z");
  });
  it("reads serial numbers (real date cells) as wall time of the zone", () => {
    // 46322.5 = 2026-10-27 12:00 wall time.
    expect(parseSheetDate(46322.5, TZ)).toBe("2026-10-27T11:00:00.000Z");
  });
  it("keeps explicit offsets and rejects junk", () => {
    expect(parseSheetDate("2026-10-27T08:00:00Z", TZ)).toBe("2026-10-27T08:00:00.000Z");
    expect(parseSheetDate("gestern", TZ)).toBeNull();
    expect(parseSheetDate("", TZ)).toBeNull();
    expect(parseSheetDate(12, TZ)).toBeNull();
  });
  it("sheet set to GMT, text written in German time (Light of Hope): text uses its own zone", () => {
    // lead_1793089135785 = 08:18:55 UTC; the sheet shows "2026-10-27 9:18:58".
    expect(parseSheetDate("2026-10-27 9:18:58", "Etc/GMT", TZ)).toBe("2026-10-27T08:18:58.000Z");
    // Real date cells still follow the sheet's zone.
    expect(parseSheetDate(46322.5, "Etc/GMT", TZ)).toBe("2026-10-27T12:00:00.000Z");
    const [l] = tabToLeads("Leads", [["LeadID", "Zeitstempel", "Email"], ["lead_1793089135785_x", "2026-10-27 9:18:58", "a@b.de"]], "Etc/GMT", TZ);
    expect(l.createdAt).toBe("2026-10-27T08:18:58.000Z");
  });
  it("handles the DST switch day", () => {
    expect(zonedToIso(2026, 3, 29, 3, 30, 0, TZ)).toBe("2026-03-29T01:30:00.000Z");
  });
});

describe("tabToLeads", () => {
  it("finished-leads tab: id from LeadID, every row tagged Vollständig, tracking columns dropped", () => {
    const [a, b] = tabToLeads("Google leads updated", GOOGLE_TAB, TZ);
    expect(a.externalId).toBe("lead_1793089135785_3luge0rbi");
    expect(a.tags).toEqual(["Vollständig"]);
    expect(a.complete).toBe(true);
    expect(a.platform).toBe("google");
    expect(a.contact).toEqual({ name: "Erika Muster", email: "erika@example.de", phone: "0151 2345678" });
    const labels = a.fields.map((f) => f.label);
    expect(labels).not.toContain("gclid");
    expect(labels).not.toContain("em");
    expect(labels).not.toContain("fbp");
    expect(labels).not.toContain("LeadID");
    // Landing page without click ids.
    expect(a.fields.find((f) => f.label === "Seite")?.value).toBe("https://www.example.org/sofort");
    expect(a.form).toBe("Website-Formular");
    // The team's own status stays visible as an answer; the form name is used.
    expect(b.fields).toContainEqual({ label: "Status (Sheet)", value: "abgeschlossen" });
    expect(b.form).toBe("Rueckruf Popup");
    expect(b.tags).toEqual(["Vollständig"]);
  });

  it("all-leads tab: id from the unnamed first column, status as tag, anonymous partials kept", () => {
    const leads = tabToLeads("Leads (inkl. Teil)", ALL_TAB, TZ);
    expect(leads.map((l) => l.externalId)).toEqual(["lead_1793089135785_3luge0rbi", "lead_1793011740009_kxamjxvk9", "lead_1793009903895_jaaqrmdjs"]);
    expect(leads.map((l) => l.tags)).toEqual([["Vollständig"], ["Teil-Lead"], ["Teil-Lead (anonym)"]]);
    expect(leads[1].contact.phone).toBe("0160 2222222");
    expect(leads[2].contact).toEqual({ name: null, email: null, phone: null });
    expect(leads[1].complete).toBe(false);
  });

  it("retreat tab: Retreat tag, status tag, Meta click id → facebook, campaign from utm, bookkeeping dropped", () => {
    const [a, b] = tabToLeads("Retreat Leads", RETREAT_TAB, TZ);
    expect(a.externalId).toBe("341116fe-bc67-49e9-a33e-b4b7e55e0001");
    expect(a.tags).toEqual(["Retreat", "Teil-Bewerbung"]);
    expect(a.form).toBe("Retreat-Bewerbung");
    expect(a.platform).toBe("facebook");
    expect(a.campaign).toBe("retreat_okt");
    expect(a.contact.email).toBe("lena@example.de");
    const labels = a.fields.map((f) => f.label);
    expect(labels).toContain("Letzter Schritt");
    expect(labels).not.toContain("ext_id");
    expect(labels).not.toContain("E-Mail gesendet");
    expect(a.createdAt).toBe("2026-10-27T10:10:20.000Z");
    // A row with only "Letzter Schritt" is still an (anonymous) started application.
    expect(b.tags).toEqual(["Retreat"]);
  });

  it("skips empty rows and makes stable ids when there is no id column", () => {
    const rows = [["Datum", "Name", "Telefon"], ["", "", ""], ["27.10.2026, 10:00", "A B", "0151 9"]];
    const one = tabToLeads("Form", rows, TZ);
    const two = tabToLeads("Form", rows, TZ);
    expect(one).toHaveLength(1);
    expect(one[0].externalId).toMatch(/^sheet:[0-9a-f]{20}$/);
    expect(one[0].externalId).toBe(two[0].externalId);
  });

  it("Light of Hope fragments: id-only rows take the id's time and aren't 'Vollständig'; id-less, timeless, contactless rows are dropped", () => {
    const [frag] = tabToLeads(
      "Google leads updated",
      [GOOGLE_TAB[0], ["", "", "", "", "", "", "Stress", "", "", "lead_1791981410000_abcdefghi", "", "", ""]],
      TZ,
    );
    expect(frag.createdAt).toBe(new Date(1791981410000).toISOString());
    expect(frag.tags).toEqual(["Teil-Lead (anonym)"]);
    expect(frag.complete).toBe(false);
    const retreat = tabToLeads("Retreat Leads", [RETREAT_TAB[0], ["", "", "", "", "", "", "", "", "", "5", "", "", "", ""]], TZ);
    expect(retreat).toEqual([]);
    // A name alone is still a lead worth keeping.
    expect(tabToLeads("x", [["Name", "Frage"], ["Jo Doe", "a"]], TZ)).toHaveLength(1);
  });

  it("Oh My Acai franchise tab: 'Eingegangen' is the time column", () => {
    const [l] = tabToLeads(
      "Franchise",
      [["Eingegangen", "Name", "E-Mail", "Telefon", "Stadt / Region", "Kapital", "Start", "Gastro-Erfahrung", "Status"], ["25.10.2026 20:26", "Max Muster", "max@example.de", "0151 1", "Köln", "50k", "sofort", "ja", "Neu"]],
      "Etc/GMT",
      TZ,
    );
    expect(l.createdAt).toBe("2026-10-25T19:26:00.000Z");
    expect(l.fields.map((f) => f.label)).not.toContain("Eingegangen");
    expect(l.tags).toEqual(["Vollständig"]);
  });

  it("copes with ragged rows, numbers and an empty tab", () => {
    expect(tabToLeads("x", [], TZ)).toEqual([]);
    expect(tabToLeads("x", [["Email"]], TZ)).toEqual([]);
    const [l] = tabToLeads("x", [["LeadID", "Email", "Telefon", "Alter"], ["id-0000000001", "a@b.de", 491511234567, 34]], TZ);
    expect(l.contact.phone).toBe("491511234567");
    expect(l.fields).toContainEqual({ label: "Alter", value: "34" });
  });
});

describe("mergeSheetLeads", () => {
  it("one lead per id across tabs; Vollständig wins over Teil; earliest time; answers merged", () => {
    const merged = mergeSheetLeads([tabToLeads("Google leads updated", GOOGLE_TAB, TZ), tabToLeads("Leads (inkl. Teil)", ALL_TAB, TZ)]);
    expect(merged).toHaveLength(4);
    const erika = merged.find((l) => l.externalId === "lead_1793089135785_3luge0rbi")!;
    expect(erika.tags).toEqual(["Vollständig"]);
    expect(erika.createdAt).toBe("2026-10-27T08:16:39.000Z");
    expect(erika.fields.find((f) => f.label === "Frage2_Dringlichkeit")?.value).toBe("Sofort");
    // Same label is not duplicated.
    expect(erika.fields.filter((f) => f.label === "Telefon")).toHaveLength(1);
  });

  it("a partial that later appears finished is tagged complete only", () => {
    const partial = tabToLeads("Leads (inkl. Teil)", [ALL_TAB[0], ["lead_x_000000001", "2026-10-27 9:00:00", "Teil-Lead", "Jo", "", "0151 1", "", "", "", "", ""]], TZ);
    const done = tabToLeads("Leads (inkl. Teil)", [ALL_TAB[0], ["lead_x_000000001", "2026-10-27 9:00:00", "Vollständig", "Jo", "Doe", "0151 1", "jo@x.de", "", "", "Stress", "Bald"]], TZ);
    expect(mergeSheetLeads([partial])[0].tags).toEqual(["Teil-Lead"]);
    expect(mergeSheetLeads([partial, done])[0].tags).toEqual(["Vollständig"]);
    expect(leadFingerprint(mergeSheetLeads([partial])[0])).not.toBe(leadFingerprint(mergeSheetLeads([done])[0]));
  });

  it("fingerprint is stable for unchanged rows", () => {
    const a = mergeSheetLeads([tabToLeads("Retreat Leads", RETREAT_TAB, TZ)]);
    const b = mergeSheetLeads([tabToLeads("Retreat Leads", RETREAT_TAB, TZ)]);
    expect(a.map(leadFingerprint)).toEqual(b.map(leadFingerprint));
  });
});

describe("helpers", () => {
  it("spreadsheetIdFrom", () => {
    expect(spreadsheetIdFrom("https://docs.google.com/spreadsheets/d/1np-l81lBeZ8850Gxw7Ps0hrOUZ56823uJsDU3SRe8KU/edit?gid=191990973#gid=191990973")).toBe("1np-l81lBeZ8850Gxw7Ps0hrOUZ56823uJsDU3SRe8KU");
    expect(spreadsheetIdFrom("1np-l81lBeZ8850Gxw7Ps0hrOUZ56823uJsDU3SRe8KU")).toBe("1np-l81lBeZ8850Gxw7Ps0hrOUZ56823uJsDU3SRe8KU");
    expect(spreadsheetIdFrom("https://evil.example/spreadsheets/x")).toBeNull();
    expect(spreadsheetIdFrom("")).toBeNull();
  });
  it("looksLikeLeadTab", () => {
    expect(looksLikeLeadTab(["Datum", "E-Mail"])).toBe(true);
    expect(looksLikeLeadTab(["Kampagne", "Kosten"])).toBe(false);
  });
});
