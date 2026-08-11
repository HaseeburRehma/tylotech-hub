/**
 * App localization. German is the default; English is available via the toggle.
 * Keys are flat dot-paths. Missing keys fall back to the key itself, then English.
 */
export type Locale = "de" | "en";
export const LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "locale";

type Dict = Record<string, string>;

const en: Dict = {
  "lang.de": "Deutsch",
  "lang.en": "English",

  // nav
  "nav.workspace": "Workspace",
  "nav.tylotech": "TyloTech",
  "nav.dashboard": "Dashboard",
  "nav.performance": "Performance",
  "nav.integrations": "Integrations",
  "nav.aiTools": "AI Tools",
  "nav.chat": "Chat & Updates",
  "nav.documents": "Documents",
  "nav.internalHub": "Internal Hub",
  "nav.projects": "Projects",
  "nav.aiPrompts": "AI Prompts",
  "nav.settings": "Settings",
  "nav.unlockAi": "Unlock more AI",
  "nav.unlockAiDesc": "Add the SEO Analyzer & Audience Insights to your plan.",
  "nav.viewAddons": "View add-ons →",

  // topbar
  "topbar.search": "Search reports, documents, projects…",
  "topbar.signOut": "Sign out",

  // auth
  "auth.welcomeBack": "Welcome back",
  "auth.signInSubtitle": "Sign in to your client portal.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.forgot": "Forgot?",
  "auth.signIn": "Sign in",
  "auth.teamMemberQ": "TyloTech team member?",
  "auth.createAccount": "Create an account",
  "auth.poweredBy": "Powered by",
  "auth.headline": "Your growth,\nin one place.",
  "auth.feature1Title": "Live performance",
  "auth.feature1Desc": "Real-time KPIs across Meta, Google & SEO.",
  "auth.feature2Title": "AI marketing tools",
  "auth.feature2Desc": "On-brand content, ad copy & SEO in seconds.",
  "auth.feature3Title": "Your team, one click away",
  "auth.feature3Desc": "Chat, reports and updates in one place.",
  "auth.secure": "Private, secure & GDPR-compliant · Powered by TyloTech",
  "auth.createTitle": "Create your account",
  "auth.createSubtitle": "Register a new TyloTech team member.",
  "auth.fullName": "Full name",
  "auth.workEmail": "Work email",
  "auth.inviteCode": "Invite code",
  "auth.createBtn": "Create account",
  "auth.alreadyQ": "Already have an account?",
  "auth.signInLink": "Sign in",
  "auth.created": "Account created",
  "auth.takingYou": "Taking you to sign in…",

  // dashboard
  "dash.welcome": "Welcome back, {name}",
  "dash.subtitle": "Here's how your campaigns are performing this month.",
  "dash.export": "Export report",
  "dash.adSpendLeads": "Ad spend & leads",
  "dash.last30days": "Last 30 days",
  "dash.spend": "Spend",
  "dash.leads": "Leads",
  "dash.noDataTitle": "No performance data yet",
  "dash.noDataBody": "Your TyloTech team is setting up your reporting. Your KPIs and charts will appear here as soon as your campaigns are connected.",
  "dash.noSeries": "No time-series data yet — connect an ad source to populate this chart.",
  "dash.recentUpdates": "Recent updates",
  "dash.viewAll": "View all",

  // chat
  "chat.title": "Chat & Updates",
  "chat.subtitle": "Talk to your TyloTech team and track what we've shipped.",
  "chat.requestTask": "Request report or task",
  "chat.requestSent": "Request sent",
  "chat.conversations": "Conversations",
  "chat.team": "TyloTech Team",
  "chat.groupEveryone": "Group · everyone",
  "chat.groupThread": "Group thread",
  "chat.directMessage": "Direct message",
  "chat.noMessages": "No messages yet.",
  "chat.sayHello": "Say hello to the team.",
  "chat.startPrivate": "Start a private chat with {name}.",
  "chat.messageTeam": "Message the team…",
  "chat.messagePerson": "Message {name}…",
  "chat.thisMonthAt": "This month at TyloTech",
  "chat.translated": "Translated",

  // common
  "common.connect": "Connect",
  "common.disconnect": "Disconnect",
  "common.sync": "Sync",
  "common.client": "Client",
};

const de: Dict = {
  "lang.de": "Deutsch",
  "lang.en": "English",

  "nav.workspace": "Arbeitsbereich",
  "nav.tylotech": "TyloTech",
  "nav.dashboard": "Übersicht",
  "nav.performance": "Leistung",
  "nav.integrations": "Integrationen",
  "nav.aiTools": "KI-Tools",
  "nav.chat": "Chat & Updates",
  "nav.documents": "Dokumente",
  "nav.internalHub": "Interner Bereich",
  "nav.projects": "Projekte",
  "nav.aiPrompts": "KI-Prompts",
  "nav.settings": "Einstellungen",
  "nav.unlockAi": "Mehr KI freischalten",
  "nav.unlockAiDesc": "SEO-Analyzer & Zielgruppen-Insights zu Ihrem Plan hinzufügen.",
  "nav.viewAddons": "Add-ons ansehen →",

  "topbar.search": "Berichte, Dokumente, Projekte suchen…",
  "topbar.signOut": "Abmelden",

  "auth.welcomeBack": "Willkommen zurück",
  "auth.signInSubtitle": "Melden Sie sich in Ihrem Kundenportal an.",
  "auth.email": "E-Mail",
  "auth.password": "Passwort",
  "auth.forgot": "Vergessen?",
  "auth.signIn": "Anmelden",
  "auth.teamMemberQ": "TyloTech-Teammitglied?",
  "auth.createAccount": "Konto erstellen",
  "auth.poweredBy": "Bereitgestellt von",
  "auth.headline": "Ihr Wachstum,\nan einem Ort.",
  "auth.feature1Title": "Live-Leistung",
  "auth.feature1Desc": "Echtzeit-KPIs über Meta, Google & SEO.",
  "auth.feature2Title": "KI-Marketing-Tools",
  "auth.feature2Desc": "Markengerechte Inhalte, Anzeigentexte & SEO in Sekunden.",
  "auth.feature3Title": "Ihr Team, nur einen Klick entfernt",
  "auth.feature3Desc": "Chat, Berichte und Updates an einem Ort.",
  "auth.secure": "Privat, sicher & DSGVO-konform · Bereitgestellt von TyloTech",
  "auth.createTitle": "Konto erstellen",
  "auth.createSubtitle": "Ein neues TyloTech-Teammitglied registrieren.",
  "auth.fullName": "Vollständiger Name",
  "auth.workEmail": "Geschäftliche E-Mail",
  "auth.inviteCode": "Einladungscode",
  "auth.createBtn": "Konto erstellen",
  "auth.alreadyQ": "Sie haben bereits ein Konto?",
  "auth.signInLink": "Anmelden",
  "auth.created": "Konto erstellt",
  "auth.takingYou": "Sie werden zur Anmeldung weitergeleitet…",

  "dash.welcome": "Willkommen zurück, {name}",
  "dash.subtitle": "So performen Ihre Kampagnen diesen Monat.",
  "dash.export": "Bericht exportieren",
  "dash.adSpendLeads": "Werbeausgaben & Leads",
  "dash.last30days": "Letzte 30 Tage",
  "dash.spend": "Ausgaben",
  "dash.leads": "Leads",
  "dash.noDataTitle": "Noch keine Leistungsdaten",
  "dash.noDataBody": "Ihr TyloTech-Team richtet Ihr Reporting ein. Ihre KPIs und Diagramme erscheinen hier, sobald Ihre Kampagnen verbunden sind.",
  "dash.noSeries": "Noch keine Zeitreihendaten — verbinden Sie eine Werbequelle, um dieses Diagramm zu füllen.",
  "dash.recentUpdates": "Neueste Updates",
  "dash.viewAll": "Alle ansehen",

  "chat.title": "Chat & Updates",
  "chat.subtitle": "Sprechen Sie mit Ihrem TyloTech-Team und verfolgen Sie, was wir geliefert haben.",
  "chat.requestTask": "Bericht oder Aufgabe anfragen",
  "chat.requestSent": "Anfrage gesendet",
  "chat.conversations": "Unterhaltungen",
  "chat.team": "TyloTech-Team",
  "chat.groupEveryone": "Gruppe · alle",
  "chat.groupThread": "Gruppen-Chat",
  "chat.directMessage": "Direktnachricht",
  "chat.noMessages": "Noch keine Nachrichten.",
  "chat.sayHello": "Begrüßen Sie das Team.",
  "chat.startPrivate": "Starten Sie einen privaten Chat mit {name}.",
  "chat.messageTeam": "Nachricht an das Team…",
  "chat.messagePerson": "Nachricht an {name}…",
  "chat.thisMonthAt": "Diesen Monat bei TyloTech",
  "chat.translated": "Übersetzt",

  "common.connect": "Verbinden",
  "common.disconnect": "Trennen",
  "common.sync": "Synchronisieren",
  "common.client": "Kunde",
};

export const DICT: Record<Locale, Dict> = { de, en };

/** Translate a key with optional {placeholder} interpolation. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = DICT[locale]?.[key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}
