/**
 * Every place leads can come from, as the Lead sources dialog shows them.
 * Shared by the UI and the API (no server imports here).
 *
 * How a provider connects:
 *   meta        Meta login (Facebook / Instagram lead forms)
 *   google_ads  the partner's connected Google Ads account (lead forms via the API)
 *   sheet       a Google Sheet a website form writes into
 *   token       an access token the partner pastes (HubSpot, Pipedrive); we fetch
 *   webhook     the tool posts each submission to a private URL
 *   automation  only through Zapier or Make (LinkedIn, TikTok)
 *
 * Storage (no schema change): webhook and token providers are `webhook` sources
 * with `config.provider`; Google Ads via the account is a `google_ads` source
 * with `config.mode = "api"`; the Google Ads webhook is a plain `google_ads` one.
 */

export type LeadProviderId =
  | "meta"
  | "google_ads"
  | "google_ads_form"
  | "google_sheet"
  | "hubspot"
  | "pipedrive"
  | "typeform"
  | "tally"
  | "heyflow"
  | "perspective"
  | "jotform"
  | "webflow"
  | "wordpress"
  | "zapier"
  | "make"
  | "website"
  | "linkedin"
  | "tiktok";

export type LeadProviderGroup = "ads" | "crm" | "forms" | "automation";
export type LeadConnect = "meta" | "google_ads" | "sheet" | "token" | "webhook" | "automation";

type Text = { de: string; en: string };

export interface LeadProvider {
  id: LeadProviderId;
  name: string;
  group: LeadProviderGroup;
  connect: LeadConnect;
  /** Brand mark key (brand-paths.ts) or a letter tile. */
  logo: { brand?: string; letter?: string; hex: string };
  /** Stored as the lead's platform when the payload doesn't say. */
  platform: string;
  /** One line in the catalogue. */
  blurb: Text;
  /** Setup steps, in order. */
  steps?: Text[];
  /** Where the token comes from (token providers). */
  tokenHint?: Text;
  /** Popular in the DACH region: shown first. */
  popular?: boolean;
}

const t = (de: string, en: string): Text => ({ de, en });
const URL_STEP = t("Webhook-URL unten kopieren (der Schlüssel ist schon enthalten) und dort einfügen.", "Copy the webhook URL below (the key is already in it) and paste it there.");

export const LEAD_PROVIDERS: LeadProvider[] = [
  {
    id: "meta",
    name: "Meta Lead Ads",
    group: "ads",
    connect: "meta",
    logo: { brand: "meta", hex: "#0467DF" },
    platform: "facebook",
    popular: true,
    blurb: t("Facebook- und Instagram-Leadformulare. Neue Leads kommen automatisch.", "Facebook and Instagram lead forms. New leads arrive automatically."),
    steps: [t("Mit Meta anmelden und die Facebook-Seiten des Partners auswählen.", "Sign in with Meta and pick the partner's Facebook pages."), t("Fertig: Leads der letzten 30 Tage werden übernommen, neue laufend.", "Done: leads of the last 30 days are imported, new ones keep coming.")],
  },
  {
    id: "google_ads",
    name: "Google Ads",
    group: "ads",
    connect: "google_ads",
    logo: { brand: "googleads", hex: "#4285F4" },
    platform: "google",
    popular: true,
    blurb: t("Leadformular-Erweiterungen direkt aus dem verbundenen Google-Ads-Konto.", "Lead form assets straight from the connected Google Ads account."),
    steps: [
      t("Google Ads unter Integrationen verbinden und das Werbekonto wählen (einmalig).", "Connect Google Ads under Integrations and pick the ad account (once)."),
      t("Hier einschalten: Leads der letzten 30 Tage kommen sofort, neue jede Minute.", "Switch it on here: leads of the last 30 days arrive now, new ones every minute."),
    ],
  },
  {
    id: "google_ads_form",
    name: "Google Ads (Webhook)",
    group: "ads",
    connect: "webhook",
    logo: { brand: "googleads", hex: "#4285F4" },
    platform: "google",
    blurb: t("Für Konten, die nicht verbunden werden können: Google schickt jeden Lead sofort.", "For accounts that can't be connected: Google sends each lead instantly."),
    steps: [
      t("Google Ads → Assets → Leadformulare → Formular öffnen.", "Google Ads → Assets → Lead forms → open the form."),
      t("„Lead-Zustellungsoption“ → Webhook-URL und Schlüssel unten einfügen.", "“Lead delivery option” → paste the webhook URL and key below."),
      t("„Testdaten senden“: ein TEST-Lead erscheint hier.", "“Send test data”: a TEST lead shows up here."),
    ],
  },
  {
    id: "google_sheet",
    name: "Google Sheets",
    group: "forms",
    connect: "sheet",
    logo: { brand: "googlesheets", hex: "#34A853" },
    platform: "website",
    popular: true,
    blurb: t("Website-Formulare, die in ein Google Sheet schreiben, auch halb ausgefüllte.", "Website forms that write into a Google Sheet, half-filled ones too."),
    steps: [t("Link zum Sheet einfügen und mit Google anmelden (nur Lesezugriff).", "Paste the sheet link and sign in with Google (read-only)."), t("Die Tabs mit Leads auswählen.", "Pick the tabs that hold leads.")],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    group: "crm",
    connect: "token",
    logo: { brand: "hubspot", hex: "#FF7A59" },
    platform: "hubspot",
    popular: true,
    blurb: t("Neue Kontakte aus HubSpot-Formularen, jede Minute abgeglichen.", "New contacts from HubSpot forms, checked every minute."),
    steps: [
      t("HubSpot → Einstellungen (Zahnrad) → Integrationen → Private Apps (neuere Konten: Entwicklung → Legacy-Apps).", "HubSpot → Settings (gear) → Integrations → Private Apps (newer accounts: Development → Legacy apps)."),
      t("„Private App erstellen“, Name „TyloHQ“, unter Bereiche „crm.objects.contacts.read“ anhaken.", "“Create a private app”, name it “TyloHQ”, under Scopes tick “crm.objects.contacts.read”."),
      t("Erstellen, dann das Zugriffstoken kopieren und unten einfügen.", "Create it, then copy the access token and paste it below."),
    ],
    tokenHint: t("Zugriffstoken der Private App (beginnt mit pat-…)", "Private app access token (starts with pat-…)"),
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    group: "crm",
    connect: "token",
    logo: { letter: "P", hex: "#017737" },
    platform: "pipedrive",
    popular: true,
    blurb: t("Neue Leads aus dem Pipedrive-Leads-Posteingang (Webformulare, Chatbot, LeadBooster).", "New leads from the Pipedrive Leads Inbox (web forms, chatbot, LeadBooster)."),
    steps: [
      t("Pipedrive → Profilbild oben rechts → Persönliche Einstellungen → API.", "Pipedrive → profile picture top right → Personal preferences → API."),
      t("Persönlichen API-Token kopieren und unten einfügen.", "Copy your personal API token and paste it below."),
    ],
    tokenHint: t("Persönlicher API-Token", "Personal API token"),
  },
  {
    id: "typeform",
    name: "Typeform",
    group: "forms",
    connect: "webhook",
    logo: { letter: "Tf", hex: "#262627" },
    platform: "typeform",
    blurb: t("Jede Antwort mit allen Fragen und Hidden Fields.", "Every response with all questions and hidden fields."),
    steps: [t("Formular → Connect → Webhooks → „Add a webhook“.", "Form → Connect → Webhooks → “Add a webhook”."), URL_STEP, t("Speichern, Webhook einschalten, „Send test request“.", "Save, switch the webhook on, “Send test request”.")],
  },
  {
    id: "tally",
    name: "Tally",
    group: "forms",
    connect: "webhook",
    logo: { letter: "T", hex: "#000000" },
    platform: "tally",
    blurb: t("Antworten aus Tally-Formularen, inklusive Auswahlfeldern.", "Responses from Tally forms, choice fields included."),
    steps: [t("Formular → Integrationen → Webhooks → Verbinden.", "Form → Integrations → Webhooks → Connect."), URL_STEP, t("Verbinden. Eine Testeinsendung erscheint hier.", "Connect. A test submission shows up here.")],
  },
  {
    id: "heyflow",
    name: "Heyflow",
    group: "forms",
    connect: "webhook",
    logo: { letter: "h", hex: "#6B4EFF" },
    platform: "heyflow",
    popular: true,
    blurb: t("Funnels und Multi-Step-Formulare aus Heyflow.", "Funnels and multi-step forms from Heyflow."),
    steps: [t("Flow → Integrieren → Webhooks → Webhook hinzufügen.", "Flow → Integrate → Webhooks → Add webhook."), URL_STEP, t("Speichern und den Flow neu veröffentlichen.", "Save and publish the flow again.")],
  },
  {
    id: "perspective",
    name: "Perspective",
    group: "forms",
    connect: "webhook",
    logo: { letter: "P", hex: "#1E1B4B" },
    platform: "perspective",
    popular: true,
    blurb: t("Leads aus Perspective-Funnels.", "Leads from Perspective funnels."),
    steps: [t("Funnel → Integrationen → Webhook.", "Funnel → Integrations → Webhook."), URL_STEP, t("Speichern und einen Testlead absenden.", "Save and send a test lead.")],
  },
  {
    id: "jotform",
    name: "Jotform",
    group: "forms",
    connect: "webhook",
    logo: { letter: "J", hex: "#FF6100" },
    platform: "jotform",
    blurb: t("Einsendungen aus Jotform-Formularen.", "Submissions from Jotform forms."),
    steps: [t("Formular → Einstellungen → Integrationen → „WebHooks“ suchen.", "Form → Settings → Integrations → search “WebHooks”."), URL_STEP, t("„Integration abschließen“.", "“Complete integration”.")],
  },
  {
    id: "webflow",
    name: "Webflow",
    group: "forms",
    connect: "webhook",
    logo: { brand: "webflow", hex: "#146EF5" },
    platform: "website",
    blurb: t("Formulare einer Webflow-Website.", "Forms on a Webflow site."),
    steps: [t("Site-Einstellungen → Apps & Integrationen → Webhooks → Webhook hinzufügen.", "Site settings → Apps & integrations → Webhooks → Add webhook."), t("Auslöser „Form submission“ wählen.", "Choose the trigger “Form submission”."), URL_STEP],
  },
  {
    id: "wordpress",
    name: "WordPress",
    group: "forms",
    connect: "webhook",
    logo: { brand: "wordpress", hex: "#21759B" },
    platform: "website",
    popular: true,
    blurb: t("Elementor, Contact Form 7, WPForms und Gravity Forms.", "Elementor, Contact Form 7, WPForms and Gravity Forms."),
    steps: [
      t("Elementor: Formular → Aktionen nach dem Absenden → Webhook hinzufügen, „Erweiterte Daten“ an.", "Elementor: form → Actions after submit → add Webhook, “Advanced data” on."),
      t("Contact Form 7: Plugin „CF7 to Webhook“. WPForms / Gravity Forms: Webhooks-Addon.", "Contact Form 7: plugin “CF7 to Webhook”. WPForms / Gravity Forms: Webhooks add-on."),
      URL_STEP,
    ],
  },
  {
    id: "zapier",
    name: "Zapier",
    group: "automation",
    connect: "webhook",
    logo: { letter: "Z", hex: "#FF4F00" },
    platform: "zapier",
    popular: true,
    blurb: t("Jede App mit Zapier-Anbindung (6.000+), z. B. Calendly, Typeform, CRM.", "Any app on Zapier (6,000+), e.g. Calendly, Typeform, CRMs."),
    steps: [
      t("Zap anlegen: Auslöser = die App mit den Leads.", "Create a Zap: trigger = the app with the leads."),
      t("Aktion „Webhooks by Zapier“ → POST, Payload Type „JSON“.", "Action “Webhooks by Zapier” → POST, payload type “JSON”."),
      URL_STEP,
      t("Felder zuordnen (Name, E-Mail, Telefon, …) und testen.", "Map the fields (name, email, phone, …) and test."),
    ],
  },
  {
    id: "make",
    name: "Make",
    group: "automation",
    connect: "webhook",
    logo: { brand: "make", hex: "#6D00CC" },
    platform: "make",
    blurb: t("Szenarien aus Make (früher Integromat).", "Scenarios from Make (formerly Integromat)."),
    steps: [
      t("Szenario: Auslöser = die App mit den Leads.", "Scenario: trigger = the app with the leads."),
      t("Modul „HTTP → Make a request“: Methode POST, Body-Typ „Raw“, Inhaltstyp JSON.", "Module “HTTP → Make a request”: method POST, body type “Raw”, content type JSON."),
      URL_STEP,
      t("Felder zuordnen und einmal ausführen.", "Map the fields and run once."),
    ],
  },
  {
    id: "website",
    name: "Website / API",
    group: "automation",
    connect: "webhook",
    logo: { letter: "</>", hex: "#475569" },
    platform: "website",
    blurb: t("Jedes Formular oder System, das JSON oder Formulardaten senden kann.", "Any form or system that can send JSON or form data."),
    steps: [
      t("POST an die URL unten, als JSON oder Formulardaten.", "POST to the URL below, as JSON or form data."),
      t("Schlüssel als ?key=… in der URL oder im Header X-Lead-Key.", "Key as ?key=… in the URL or in the X-Lead-Key header."),
      t("Felder frei benennen (name, email, phone, …). is_test: true markiert Tests.", "Name fields freely (name, email, phone, …). is_test: true marks tests."),
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn Lead Gen",
    group: "ads",
    connect: "automation",
    logo: { brand: "linkedin", hex: "#0A66C2" },
    platform: "linkedin",
    blurb: t("LinkedIn-Leadformulare, über Zapier oder Make.", "LinkedIn lead gen forms, through Zapier or Make."),
    steps: [
      t("In Zapier oder Make: Auslöser „LinkedIn Lead Gen Forms → New Form Response“.", "In Zapier or Make: trigger “LinkedIn Lead Gen Forms → New Form Response”."),
      t("Aktion: Webhook an die URL unten (POST, JSON), Feld platform = linkedin.", "Action: webhook to the URL below (POST, JSON), field platform = linkedin."),
    ],
  },
  {
    id: "tiktok",
    name: "TikTok Lead Generation",
    group: "ads",
    connect: "automation",
    logo: { brand: "tiktok", hex: "#000000" },
    platform: "tiktok",
    blurb: t("TikTok-Instant-Forms, über Zapier oder Make.", "TikTok instant forms, through Zapier or Make."),
    steps: [
      t("In Zapier oder Make: Auslöser „TikTok Lead Generation → New Lead“.", "In Zapier or Make: trigger “TikTok Lead Generation → New Lead”."),
      t("Aktion: Webhook an die URL unten (POST, JSON), Feld platform = tiktok.", "Action: webhook to the URL below (POST, JSON), field platform = tiktok."),
    ],
  },
];

export const PROVIDER_BY_ID = new Map(LEAD_PROVIDERS.map((p) => [p.id, p]));
export const WEBHOOK_PROVIDERS = new Set(LEAD_PROVIDERS.filter((p) => p.connect === "webhook" || p.connect === "automation").map((p) => p.id));
export const TOKEN_PROVIDERS = new Set(LEAD_PROVIDERS.filter((p) => p.connect === "token").map((p) => p.id));

/** Which provider a stored source is. */
export function providerOfSource(s: { kind: string; config?: { provider?: string; mode?: string } | null }): LeadProviderId {
  if (s.kind === "meta") return "meta";
  if (s.kind === "google_sheet") return "google_sheet";
  if (s.kind === "google_ads") return s.config?.mode === "api" ? "google_ads" : "google_ads_form";
  const p = s.config?.provider as LeadProviderId | undefined;
  return p && PROVIDER_BY_ID.has(p) ? p : "website";
}

/** A lead's platform → the provider whose logo stands for it in the table. */
export function providerOfPlatform(platform: string | null | undefined, source: string): LeadProviderId | null {
  const p = (platform ?? "").toLowerCase();
  if (source === "meta" || p === "facebook" || p === "instagram") return "meta";
  if (source === "google_ads" || p === "google") return "google_ads";
  const hit = LEAD_PROVIDERS.find((x) => x.id === p || x.platform === p);
  return hit && hit.platform !== "website" ? hit.id : null;
}
