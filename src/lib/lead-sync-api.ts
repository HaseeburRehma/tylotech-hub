import type { SupabaseClient } from "@supabase/supabase-js";
import { GOOGLE_ADS_VERSION } from "@/lib/integrations/fetchers";
import { refreshGoogleAccessToken } from "@/lib/integrations/oauth";
import { ingestLead, type IncomingLead } from "@/lib/leads";
import { prettyLabel, type LeadField } from "@/lib/leads-shared";

/**
 * Lead sources we fetch from ourselves (no webhook on the other side):
 *   HubSpot   new contacts that came in through a form (private app token)
 *   Pipedrive new leads in the Leads Inbox (personal API token)
 *   Google Ads lead form submissions of the partner's connected Google Ads account
 * Each source is asked at most once a minute, side by side; new leads alert
 * like any other (after the first import, which is stored silently).
 */

export type ApiProvider = "hubspot" | "pipedrive" | "google_ads";

export interface ApiSourceConfig {
  provider?: string;
  mode?: string;
  /** Shown in the UI: HubSpot portal / Pipedrive company. */
  account?: string;
  /** Set once the first import is through; until then nothing alerts. */
  importedAt?: string;
  /** Throttled by the provider: don't call before this time. */
  retryAt?: string;
  [k: string]: unknown;
}

interface SourceRow {
  id: string;
  client_id: string;
  kind: string;
  access_token: string | null;
  last_synced_at: string | null;
  config: ApiSourceConfig | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const FETCH_TIMEOUT_MS = 15_000;
async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { message?: string; error?: string | { message?: string } } | null) ?? null;
    const text = typeof msg?.error === "object" ? msg.error?.message : msg?.message ?? msg?.error;
    throw new ApiError(String(text || `HTTP ${res.status}`).slice(0, 300), res.status);
  }
  return body as T;
}

export const apiProviderOf = (s: { kind: string; config?: ApiSourceConfig | null }): ApiProvider | null =>
  s.kind === "google_ads" && s.config?.mode === "api" ? "google_ads" : s.kind === "webhook" && (s.config?.provider === "hubspot" || s.config?.provider === "pipedrive") ? s.config.provider : null;

const field = (label: string, value: unknown): LeadField[] => {
  const v = Array.isArray(value) ? value.filter(Boolean).join(", ") : value == null ? "" : String(value).trim();
  return v ? [{ label, value: v.slice(0, 4000) }] : [];
};

// ---------------------------------------------------------------- HubSpot

const HS = "https://api.hubapi.com";
const HS_PROPS: [string, string][] = [
  ["firstname", "Vorname"],
  ["lastname", "Nachname"],
  ["email", "E-Mail"],
  ["phone", "Telefon"],
  ["mobilephone", "Mobil"],
  ["company", "Firma"],
  ["jobtitle", "Position"],
  ["city", "Ort"],
  ["zip", "PLZ"],
  ["address", "Adresse"],
  ["website", "Website"],
  ["message", "Nachricht"],
];
const HS_META = ["createdate", "recent_conversion_event_name", "first_conversion_event_name", "hs_analytics_source", "hs_analytics_source_data_1", "hs_analytics_source_data_2"];

/** Token check on connect: works and may read contacts. Returns the portal for display. */
export async function verifyHubspot(token: string): Promise<{ account: string }> {
  const auth = { Authorization: `Bearer ${token}` };
  await call(`${HS}/crm/v3/objects/contacts?limit=1&properties=email`, { headers: auth });
  const info = await call<{ portalId?: number; companyName?: string }>(`${HS}/account-info/v3/details`, { headers: auth }).catch(() => null);
  return { account: info?.companyName || (info?.portalId ? `HubSpot ${info.portalId}` : "HubSpot") };
}

type HsContact = { id: string; properties: Record<string, string | null> };

export function hubspotLead(c: HsContact): Omit<IncomingLead, "clientId" | "sourceId" | "notify"> {
  const p = c.properties;
  const src = (p.hs_analytics_source ?? "").toUpperCase();
  const d1 = (p.hs_analytics_source_data_1 ?? "").toLowerCase();
  const platform = src === "PAID_SOCIAL" || src === "SOCIAL_MEDIA" ? (/insta/.test(d1) ? "instagram" : /linkedin/.test(d1) ? "linkedin" : /tiktok/.test(d1) ? "tiktok" : "facebook") : src === "PAID_SEARCH" ? "google" : "hubspot";
  return {
    source: "webhook",
    externalId: `hubspot:${c.id}`,
    createdAt: p.createdate ?? null,
    fields: HS_PROPS.flatMap(([k, label]) => field(label, p[k])),
    campaign: src.startsWith("PAID") ? p.hs_analytics_source_data_2 || null : null,
    form: p.recent_conversion_event_name || p.first_conversion_event_name || null,
    platform,
  };
}

async function hubspotSince(token: string, sinceMs: number) {
  const out: HsContact[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await call<{ results: HsContact[]; paging?: { next?: { after?: string } } }>(`${HS}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Only people who sent a form (not imports or contacts typed in by hand).
        filterGroups: [
          {
            filters: [
              { propertyName: "createdate", operator: "GTE", value: String(sinceMs) },
              { propertyName: "recent_conversion_event_name", operator: "HAS_PROPERTY" },
            ],
          },
        ],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        properties: [...HS_PROPS.map(([k]) => k), ...HS_META],
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
    out.push(...res.results);
    after = res.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

// ---------------------------------------------------------------- Pipedrive

const PD = "https://api.pipedrive.com/v1";
const pd = (path: string, token: string) => `${PD}${path}${path.includes("?") ? "&" : "?"}api_token=${encodeURIComponent(token)}`;

export async function verifyPipedrive(token: string): Promise<{ account: string }> {
  const me = await call<{ data?: { company_name?: string; company_domain?: string } }>(pd("/users/me", token));
  return { account: me.data?.company_name || me.data?.company_domain || "Pipedrive" };
}

type PdLead = { id: string; title?: string; person_id?: number | null; organization_id?: number | null; source_name?: string | null; add_time: string; value?: { amount?: number; currency?: string } | null };
type PdPerson = { name?: string; email?: { value: string; primary?: boolean }[]; phone?: { value: string; primary?: boolean }[]; org_name?: string };

export function pipedriveLead(l: PdLead, person: PdPerson | null): Omit<IncomingLead, "clientId" | "sourceId" | "notify"> {
  const primary = (xs?: { value: string; primary?: boolean }[]) => (xs ?? []).find((x) => x.primary && x.value)?.value ?? (xs ?? []).find((x) => x.value)?.value ?? null;
  return {
    source: "webhook",
    externalId: `pipedrive:${l.id}`,
    createdAt: l.add_time,
    fields: [
      ...field("Name", person?.name),
      ...field("E-Mail", primary(person?.email)),
      ...field("Telefon", primary(person?.phone)),
      ...field("Firma", person?.org_name),
      ...field("Titel", l.title),
      ...field("Wert", l.value?.amount ? `${l.value.amount} ${l.value.currency ?? ""}`.trim() : null),
      ...field("Quelle (Pipedrive)", l.source_name),
    ],
    form: l.source_name || null,
    platform: "pipedrive",
  };
}

async function pipedriveSince(token: string, sinceMs: number) {
  const out: { lead: PdLead; person: PdPerson | null }[] = [];
  for (let page = 0; page < 5; page++) {
    const res = await call<{ data: PdLead[] | null; additional_data?: { pagination?: { more_items_in_collection?: boolean } } }>(
      pd(`/leads?limit=100&start=${page * 100}&sort=${encodeURIComponent("add_time DESC")}`, token),
    );
    const fresh = (res.data ?? []).filter((l) => Date.parse(l.add_time) >= sinceMs);
    // Typed in by hand in Pipedrive: not an enquiry that came in.
    for (const lead of fresh.filter((l) => !/manually/i.test(l.source_name ?? ""))) {
      const person = lead.person_id ? await call<{ data: PdPerson }>(pd(`/persons/${lead.person_id}`, token)).then((r) => r.data).catch(() => null) : null;
      out.push({ lead, person });
    }
    if (fresh.length < (res.data ?? []).length || !res.additional_data?.pagination?.more_items_in_collection) break;
  }
  return out;
}

// ---------------------------------------------------------------- Google Ads lead forms

const GADS_FIELDS: Record<string, string> = {
  FULL_NAME: "Name",
  FIRST_NAME: "Vorname",
  LAST_NAME: "Nachname",
  EMAIL: "E-Mail",
  WORK_EMAIL: "E-Mail (geschäftlich)",
  PHONE_NUMBER: "Telefon",
  WORK_PHONE: "Telefon (geschäftlich)",
  POSTAL_CODE: "PLZ",
  CITY: "Ort",
  STREET_ADDRESS: "Adresse",
  REGION: "Region",
  COUNTRY: "Land",
  COMPANY_NAME: "Firma",
  JOB_TITLE: "Position",
};

type GadsRow = {
  leadFormSubmissionData?: {
    id?: string;
    campaign?: string;
    adGroup?: string;
    adGroupAd?: string;
    asset?: string;
    gclid?: string;
    submissionDateTime?: string;
    leadFormSubmissionFields?: { fieldType?: string; fieldValue?: string }[];
    customLeadFormSubmissionFields?: { questionText?: string; fieldValue?: string }[];
  };
};

const lastId = (res?: string) => (res ? res.split(/[/~]/).pop() ?? null : null);

export function googleAdsLead(r: GadsRow, formNames: Map<string, string>): Omit<IncomingLead, "clientId" | "sourceId" | "notify"> | null {
  const d = r.leadFormSubmissionData;
  if (!d?.id) return null;
  return {
    source: "google_ads",
    externalId: d.id,
    // "2026-10-29 10:12:45+01:00" → ISO.
    createdAt: d.submissionDateTime ? d.submissionDateTime.replace(" ", "T") : null,
    fields: [
      ...(d.leadFormSubmissionFields ?? []).flatMap((f) => field(GADS_FIELDS[f.fieldType ?? ""] ?? prettyLabel((f.fieldType ?? "Feld").toLowerCase()), f.fieldValue)),
      ...(d.customLeadFormSubmissionFields ?? []).flatMap((f) => field(f.questionText || "Frage", f.fieldValue)),
      ...field("gclid", d.gclid),
    ],
    campaign: lastId(d.campaign),
    adGroup: lastId(d.adGroup),
    ad: lastId(d.adGroupAd),
    form: (d.asset && formNames.get(d.asset)) || "Google Ads Lead-Formular",
    platform: "google",
  };
}

/** The partner's Google Ads connection (Integrations page), or why there is none. */
export async function googleAdsAccess(admin: SupabaseClient, clientId: string): Promise<{ token: string; customerId: string; login?: string } | { error: string }> {
  const { data: g } = await admin.from("integrations").select("status,refresh_token,meta").eq("client_id", clientId).eq("provider", "google_ads").maybeSingle();
  const meta = (g?.meta ?? {}) as { accountId?: string; loginCustomerId?: string };
  if (!g || g.status !== "connected" || !g.refresh_token) return { error: "not_connected" };
  if (!meta.accountId) return { error: "no_account" };
  const token = await refreshGoogleAccessToken(g.refresh_token);
  if (!token) return { error: "expired" };
  return { token, customerId: meta.accountId.replace(/\D/g, ""), login: meta.loginCustomerId?.replace(/\D/g, "") || undefined };
}

async function googleAdsSince(access: { token: string; customerId: string; login?: string }, sinceMs: number) {
  // Like the rest of the Google Ads code: the developer token is sent when configured
  // (production works without it: the OAuth client's project carries the access).
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const search = async (query: string) => {
    const res = await call<{ results?: unknown[] }[]>(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${access.customerId}/googleAds:searchStream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access.token}`,
        "Content-Type": "application/json",
        ...(dev ? { "developer-token": dev } : {}),
        ...(access.login && access.login !== access.customerId ? { "login-customer-id": access.login } : {}),
      },
      body: JSON.stringify({ query }),
    });
    return res.flatMap((b) => b.results ?? []);
  };
  // Google gives the account's local time with its offset; a day of overlap is cheap and safe.
  const since = new Date(sinceMs - 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const rows = (await search(
    `SELECT lead_form_submission_data.id, lead_form_submission_data.campaign, lead_form_submission_data.ad_group, lead_form_submission_data.ad_group_ad, lead_form_submission_data.asset, lead_form_submission_data.gclid, lead_form_submission_data.submission_date_time, lead_form_submission_data.lead_form_submission_fields, lead_form_submission_data.custom_lead_form_submission_fields FROM lead_form_submission_data WHERE lead_form_submission_data.submission_date_time >= '${since}'`,
  )) as GadsRow[];
  const names = new Map<string, string>();
  if (rows.length) {
    const forms = (await search("SELECT asset.resource_name, asset.name, asset.lead_form_asset.headline FROM asset WHERE asset.type = 'LEAD_FORM'").catch(() => [])) as {
      asset?: { resourceName?: string; name?: string; leadFormAsset?: { headline?: string } };
    }[];
    for (const f of forms) if (f.asset?.resourceName) names.set(f.asset.resourceName, f.asset.name || f.asset.leadFormAsset?.headline || "Google Ads Lead-Formular");
  }
  return { rows, names };
}

// ---------------------------------------------------------------- runner

/** New leads of one API source since its last sync. */
export async function fetchApiLeads(admin: SupabaseClient, s: SourceRow, sinceMs: number): Promise<Omit<IncomingLead, "clientId" | "sourceId" | "notify">[]> {
  const provider = apiProviderOf(s);
  if (provider === "hubspot") return (await hubspotSince(s.access_token!, sinceMs)).map(hubspotLead);
  if (provider === "pipedrive") return (await pipedriveSince(s.access_token!, sinceMs)).map(({ lead, person }) => pipedriveLead(lead, person));
  if (provider === "google_ads") {
    const access = await googleAdsAccess(admin, s.client_id);
    if ("error" in access) throw new ApiError(access.error, access.error === "expired" ? 401 : 400);
    const { rows, names } = await googleAdsSince(access, sinceMs);
    return rows.map((r) => googleAdsLead(r, names)).filter((x): x is NonNullable<typeof x> => !!x);
  }
  return [];
}

const FIRST_IMPORT_DAYS = 30;
const OVERLAP_MS = 10 * 60_000;
const ALERT_MAX_AGE_MS = 24 * 3_600_000;

export const API_ERROR_TEXT: Record<string, string> = {
  not_connected: "Google Ads ist für diesen Partner nicht verbunden (Integrationen).",
  no_account: "Im Google-Ads-Zugang ist noch kein Werbekonto gewählt (Integrationen).",
  expired: "Zugang abgelaufen oder entzogen. Bitte neu verbinden.",
};

async function syncOne(admin: SupabaseClient, s: SourceRow, minIntervalMs: number): Promise<number> {
  const cfg: ApiSourceConfig = s.config ?? {};
  if (cfg.retryAt && Date.parse(cfg.retryAt) > Date.now()) return 0;
  if (minIntervalMs && s.last_synced_at && Date.now() - Date.parse(s.last_synced_at) < minIntervalMs) return 0;
  const startedAt = new Date().toISOString();
  const sinceMs = s.last_synced_at && cfg.importedAt ? Date.parse(s.last_synced_at) - OVERLAP_MS : Date.now() - FIRST_IMPORT_DAYS * 86_400_000;
  let added = 0;
  try {
    const leads = await fetchApiLeads(admin, s, sinceMs);
    for (const l of leads) {
      // The first import fills the list quietly; afterwards fresh leads alert.
      const fresh = !!cfg.importedAt && (!l.createdAt || Date.now() - Date.parse(l.createdAt) < ALERT_MAX_AGE_MS);
      const r = await ingestLead(admin, { ...l, clientId: s.client_id, sourceId: s.id, notify: fresh });
      if (!("error" in r) && !r.duplicate) added++;
    }
    const { retryAt: _r, ...rest } = cfg;
    await admin
      .from("lead_sources")
      .update({
        status: "active",
        last_error: null,
        last_synced_at: startedAt,
        config: { ...rest, importedAt: cfg.importedAt ?? startedAt },
        ...(added ? { last_received_at: startedAt } : {}),
      })
      .eq("id", s.id);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    const msg = e instanceof Error ? API_ERROR_TEXT[e.message] ?? e.message : "Sync failed.";
    if (status === 429) {
      // Throttled: wait, stay green.
      await admin.from("lead_sources").update({ last_error: msg, config: { ...cfg, retryAt: new Date(Date.now() + 5 * 60_000).toISOString() } }).eq("id", s.id);
    } else {
      await admin.from("lead_sources").update({ status: "error", last_error: status === 401 || status === 403 ? API_ERROR_TEXT.expired : msg.slice(0, 300) }).eq("id", s.id);
    }
  }
  return added;
}

/** All API sources (or one partner's / one source), side by side. */
export async function syncApiLeadSources(admin: SupabaseClient, opts: { clientId?: string; sourceId?: string; minIntervalMs?: number } = {}): Promise<number> {
  let q = admin.from("lead_sources").select("id,client_id,kind,access_token,last_synced_at,config").in("kind", ["webhook", "google_ads"]).neq("status", "disconnected");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.sourceId) q = q.eq("id", opts.sourceId);
  const { data } = await q;
  const sources = ((data ?? []) as SourceRow[]).filter((s) => {
    const p = apiProviderOf(s);
    return p === "google_ads" || (p && !!s.access_token);
  });
  const counts = await Promise.all(sources.map((s) => syncOne(admin, s, opts.minIntervalMs ?? 0)));
  return counts.reduce((a, b) => a + b, 0);
}
