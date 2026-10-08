/**
 * Real provider data fetchers. Given the OAuth access token stored on an integration
 * row plus its account config (ad-account id / GSC site url / GA4 property), these
 * call the live provider APIs and return normalized KPIs + a daily series.
 *
 * Each fetch covers two full 30-day windows ending yesterday (complete days only):
 * the latest window feeds the KPI values, the one before it the real % change.
 * When the previous window has no data the change is null (shown as no badge),
 * never a fabricated 0 % / +100 %.
 *
 * Return values:
 *  - FetchedData            → data landed
 *  - { error: "auth" }      → token rejected (expired/revoked) — needs reconnect
 *  - { error: "api" }       → provider error; keep existing data, retry later
 *  - null                   → missing token/config, or an empty result (false-zero
 *                             guard) — write nothing, preserve what's stored
 */
export interface FetchedKpi {
  metric_name: string;
  label: string;
  value: number;
  unit: "currency" | "number" | "percent" | "ratio";
  delta: number | null;
  period: string;
  source: string;
}

export interface FetchedData {
  series: { date: string; spend: number; leads: number; roas: number }[];
  kpis: FetchedKpi[];
}

/** `detail` is the provider's own error text (secrets stripped) for staff diagnosis. */
export type FetchError = { error: "auth" | "api"; detail?: string };
export type FetchResult = FetchedData | FetchError | null;

export const isFetchError = (r: FetchResult): r is FetchError => !!r && "error" in r;

export const META_GRAPH_VERSION = "v25.0";
const GOOGLE_ADS_VERSION = "v25";
const WINDOW_DAYS = 30;
const PERIOD = "Last 30d";

// Unambiguous AI-answer-engine referrer hostnames, as GA4's sessionSource
// reports them. Deliberately excludes bing.com/google.com — those serve both
// regular search and AI answers indistinguishably in GA4's source field.
const AI_REFERRAL_SOURCES = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "gemini.google.com",
  "claude.ai",
  "copilot.microsoft.com",
  "you.com",
  "phind.com",
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Two consecutive 30-day windows ending yesterday (UTC). */
function windows() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const curStart = new Date(end);
  curStart.setUTCDate(end.getUTCDate() - (WINDOW_DAYS - 1));
  const prevEnd = new Date(curStart);
  prevEnd.setUTCDate(curStart.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - (WINDOW_DAYS - 1));
  return { start: iso(prevStart), prevEnd: iso(prevEnd), curStart: iso(curStart), end: iso(end) };
}

/** % change, or null when there's no previous value to compare against. */
function change(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || !Number.isFinite(prev) || prev <= 0 || !Number.isFinite(cur)) return null;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

/**
 * Classify a failed provider response. 401/403 mean the grant no longer covers
 * the request; Meta reports an expired or revoked token as HTTP 400 with
 * OAuthException code 190, which must also count as "reconnect needed" — not a
 * transient error that is silently retried forever.
 */
async function errorFor(res: Response | null): Promise<FetchError> {
  if (!res) return { error: "api", detail: "network error" };
  const body: any = await res.json().catch(() => null);
  const err = body?.error ?? {};
  const message = typeof err === "string" ? err : String(err.message ?? err.status ?? `HTTP ${res.status}`);
  const detail = message.replace(/access_token=[^&\s]+/g, "access_token=***").slice(0, 200);
  const metaAuth = err.type === "OAuthException" && [102, 190, 463, 467].includes(Number(err.code ?? err.error_subcode));
  return { error: res.status === 401 || res.status === 403 || metaAuth ? "auth" : "api", detail };
}

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);

/**
 * Meta reports overlapping lead action types (lead, onsite_conversion.lead_grouped,
 * offsite_conversion.fb_pixel_lead, …). Taking the first /lead/ match made the
 * count depend on response order. Use the aggregate "lead" when present, then the
 * most common specific types — never a sum (they overlap).
 */
const LEAD_ACTION_PRIORITY = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];
export function metaLeads(actions: { action_type?: string; value?: string | number }[] | undefined): number {
  for (const type of LEAD_ACTION_PRIORITY) {
    const hit = (actions ?? []).find((a) => a.action_type === type);
    if (hit) return Number(hit.value ?? 0) || 0;
  }
  return 0;
}

/** Meta Marketing API — daily ad insights for an ad account. */
export async function fetchMetaAds(accessToken: string, accountId: string): Promise<FetchResult> {
  if (!accessToken || !accountId) return null;
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const w = windows();
  const params = new URLSearchParams({
    fields: "spend,actions,purchase_roas",
    time_increment: "1",
    time_range: JSON.stringify({ since: w.start, until: w.end }),
    limit: "100",
    access_token: accessToken,
  });

  // Follow pagination — the default page size would otherwise truncate the range.
  const rows: any[] = [];
  let next: string | null = `https://graph.facebook.com/${META_GRAPH_VERSION}/${acct}/insights?${params}`;
  for (let page = 0; next && page < 10; page++) {
    const res: Response | null = await fetch(next, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return await errorFor(res);
    const json: any = await res.json().catch(() => null);
    if (!json) return { error: "api" };
    rows.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }

  const series = rows.map((r) => {
    const leads = metaLeads(r.actions);
    const roas = Number(r.purchase_roas?.[0]?.value ?? 0);
    return { date: r.date_start as string, spend: Number(r.spend ?? 0), leads, roas };
  });

  const cur = series.filter((p) => p.date >= w.curStart);
  const prev = series.filter((p) => p.date < w.curStart);
  // False-zero guard: a 200 with no rows for the current window means "no data",
  // not "zero delivery" (Meta returns dated rows for genuine zero days).
  if (!cur.length) return null;

  const agg = (rs: typeof series) => {
    const spend = sum(rs, (p) => p.spend);
    const leads = sum(rs, (p) => p.leads);
    const value = sum(rs, (p) => p.roas * p.spend); // purchase value, so ROAS is spend-weighted
    return { spend, leads, cpl: leads > 0 ? spend / leads : 0, roas: spend > 0 ? value / spend : 0 };
  };
  const c = agg(cur);
  const p = prev.length ? agg(prev) : null;

  return {
    series,
    kpis: [
      { metric_name: "ad_spend", label: "Monthly Ad Spend", value: Number(c.spend.toFixed(2)), unit: "currency", delta: change(c.spend, p?.spend), period: PERIOD, source: "Meta Ads" },
      { metric_name: "leads", label: "Leads Generated", value: c.leads, unit: "number", delta: change(c.leads, p?.leads), period: PERIOD, source: "Meta Ads" },
      { metric_name: "cpl", label: "Cost per Lead", value: Number(c.cpl.toFixed(2)), unit: "currency", delta: c.cpl && p?.cpl ? change(c.cpl, p.cpl) : null, period: PERIOD, source: "Meta Ads" },
      { metric_name: "roas", label: "ROAS", value: Number(c.roas.toFixed(2)), unit: "ratio", delta: c.roas && p?.roas ? change(c.roas, p.roas) : null, period: PERIOD, source: "Meta Ads" },
    ],
  };
}

async function ga4Report(accessToken: string, propertyId: string, body: unknown): Promise<{ res: Response | null; json: any }> {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  const json = res?.ok ? await res.json().catch(() => null) : null;
  return { res, json };
}

/** Google Analytics 4 — Data API runReport for a property (needs numeric propertyId). */
export async function fetchGa4(accessToken: string, propertyId: string): Promise<FetchResult> {
  if (!accessToken || !propertyId) return null;
  const id = propertyId.replace(/[^0-9]/g, ""); // Data API needs the numeric property id, not "G-..."
  if (!id) return null;
  const w = windows();
  const ranges = [
    { startDate: w.curStart, endDate: w.end, name: "cur" },
    { startDate: w.start, endDate: w.prevEnd, name: "prev" },
  ];

  // Daily trend: `leads` holds daily active users, `roas` daily sessions (spend
  // doesn't apply to GA4) — reuses the shared series shape.
  const daily = await ga4Report(accessToken, id, {
    dateRanges: [{ startDate: w.start, endDate: w.end }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  if (!daily.json) return await errorFor(daily.res);
  const series = ((daily.json.rows ?? []) as any[])
    .map((r) => ({
      date: String(r.dimensionValues?.[0]?.value ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
      spend: 0,
      leads: Number(r.metricValues?.[0]?.value ?? 0),
      roas: Number(r.metricValues?.[1]?.value ?? 0),
    }))
    .filter((p) => p.date);
  if (!series.some((p) => p.date >= w.curStart)) return null;

  // Window totals in one request without a date dimension: GA4 de-duplicates
  // users across the range (summing daily users would recount returning visitors)
  // and returns the session conversion rate over the whole window.
  const totals = await ga4Report(accessToken, id, {
    dateRanges: ranges,
    metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "sessionConversionRate" }],
  });
  if (!totals.json) return await errorFor(totals.res);
  const byRange: Record<string, { users: number; sessions: number; conv: number }> = {};
  for (const r of (totals.json.rows ?? []) as any[]) {
    const key = String(r.dimensionValues?.[0]?.value ?? "cur");
    byRange[key] = {
      users: Number(r.metricValues?.[0]?.value ?? 0),
      sessions: Number(r.metricValues?.[1]?.value ?? 0),
      conv: Number(r.metricValues?.[2]?.value ?? 0) * 100,
    };
  }
  const c = byRange.cur ?? { users: 0, sessions: 0, conv: 0 };
  const p = byRange.prev;

  // AI answer-engine referral sessions, per window. Best-effort: a failure here
  // leaves these at 0 instead of blanking the core KPIs.
  const ai: Record<string, number> = { cur: 0, prev: 0 };
  const sources = await ga4Report(accessToken, id, {
    dateRanges: ranges,
    dimensions: [{ name: "sessionSource" }],
    metrics: [{ name: "sessions" }],
  });
  for (const r of (sources.json?.rows ?? []) as any[]) {
    const src = String(r.dimensionValues?.[0]?.value ?? "").toLowerCase();
    const key = String(r.dimensionValues?.[1]?.value ?? "cur");
    if (AI_REFERRAL_SOURCES.some((known) => src.includes(known))) ai[key] = (ai[key] ?? 0) + Number(r.metricValues?.[0]?.value ?? 0);
  }
  const share = (n: number, s: number) => (s ? Number(((n / s) * 100).toFixed(2)) : 0);
  const aiShareCur = share(ai.cur, c.sessions);
  const aiSharePrev = p ? share(ai.prev, p.sessions) : null;

  return {
    series,
    kpis: [
      { metric_name: "users", label: "Users", value: Math.round(c.users), unit: "number", delta: change(c.users, p?.users), period: PERIOD, source: "GA4" },
      { metric_name: "sessions", label: "Sessions", value: Math.round(c.sessions), unit: "number", delta: change(c.sessions, p?.sessions), period: PERIOD, source: "GA4" },
      { metric_name: "conv_rate", label: "Conversion Rate", value: Number(c.conv.toFixed(2)), unit: "percent", delta: change(c.conv, p?.conv), period: PERIOD, source: "GA4" },
      { metric_name: "ai_referral_sessions", label: "AI Referral Sessions", value: Math.round(ai.cur), unit: "number", delta: p ? change(ai.cur, ai.prev) : null, period: PERIOD, source: "GA4" },
      { metric_name: "ai_referral_share", label: "AI Referral Share", value: aiShareCur, unit: "percent", delta: change(aiShareCur, aiSharePrev), period: PERIOD, source: "GA4" },
    ],
  };
}

/** Google Ads — daily account metrics for a customer (needs approved developer token). */
export async function fetchGoogleAds(accessToken: string, customerId: string): Promise<FetchResult> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const cid = (customerId ?? "").replace(/[^0-9]/g, "");
  if (!accessToken || !cid || !devToken) return null;
  const w = windows();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/[^0-9]/g, "");
  if (loginCid) headers["login-customer-id"] = loginCid;

  const query = `SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${w.start}' AND '${w.end}'`;
  const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return await errorFor(res);
  const json: any = await res.json().catch(() => null);
  if (!json) return { error: "api" };
  // searchStream returns an array of batches, each with a results[] array.
  const batches: any[] = Array.isArray(json) ? json : [json];
  const results: any[] = batches.flatMap((b) => b.results ?? []);

  const byDate: Record<string, { spend: number; conv: number; value: number }> = {};
  for (const r of results) {
    const d = r.segments?.date;
    if (!d) continue;
    const e = (byDate[d] = byDate[d] || { spend: 0, conv: 0, value: 0 });
    e.spend += Number(r.metrics?.costMicros ?? 0) / 1_000_000;
    e.conv += Number(r.metrics?.conversions ?? 0);
    e.value += Number(r.metrics?.conversionsValue ?? 0);
  }
  const days = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  const cur = days.filter(([d]) => d >= w.curStart).map(([, v]) => v);
  const prev = days.filter(([d]) => d < w.curStart).map(([, v]) => v);
  if (!cur.length) return null;

  // Stored daily leads are whole numbers (integer column); totals use the exact,
  // possibly fractional, conversion counts so small daily values aren't lost.
  const series = days.map(([date, v]) => ({
    date,
    spend: Number(v.spend.toFixed(2)),
    leads: Math.round(v.conv),
    roas: v.spend ? Number((v.value / v.spend).toFixed(2)) : 0,
  }));
  const agg = (rs: typeof cur) => {
    const spend = sum(rs, (v) => v.spend);
    const conv = sum(rs, (v) => v.conv);
    const value = sum(rs, (v) => v.value);
    return { spend, conv, roas: spend ? value / spend : 0 };
  };
  const c = agg(cur);
  const p = prev.length ? agg(prev) : null;

  return {
    series,
    kpis: [
      { metric_name: "ad_spend", label: "Monthly Ad Spend", value: Number(c.spend.toFixed(2)), unit: "currency", delta: change(c.spend, p?.spend), period: PERIOD, source: "Google Ads" },
      { metric_name: "leads", label: "Conversions", value: Number(c.conv.toFixed(1)), unit: "number", delta: change(c.conv, p?.conv), period: PERIOD, source: "Google Ads" },
      { metric_name: "roas", label: "ROAS", value: Number(c.roas.toFixed(2)), unit: "ratio", delta: c.roas && p?.roas ? change(c.roas, p.roas) : null, period: PERIOD, source: "Google Ads" },
    ],
  };
}

/** Google Search Console — daily search analytics for a verified property. */
export async function fetchSearchConsole(accessToken: string, siteUrl: string): Promise<FetchResult> {
  if (!accessToken || !siteUrl) return null;
  const w = windows();

  // A property can be a URL-prefix ("https://site/") or a Domain property
  // ("sc-domain:site"). If the stored one fails, try the Domain variant.
  const candidates = [siteUrl];
  const host = siteUrl.match(/^https?:\/\/([^/]+)/i)?.[1]?.replace(/^www\./i, "");
  if (host && !siteUrl.startsWith("sc-domain:")) candidates.push(`sc-domain:${host}`);

  let rows: any[] | null = null;
  let lastRes: Response | null = null;
  for (const prop of candidates) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: w.start, endDate: w.end, dimensions: ["date"], rowLimit: 1000 }),
        cache: "no-store",
      },
    ).catch(() => null);
    lastRes = res;
    if (!res?.ok) continue;
    const json: any = await res.json().catch(() => null);
    if (!json) continue;
    rows = json.rows ?? [];
    if (rows && rows.length) break;
  }
  if (rows == null) return await errorFor(lastRes);

  // `leads` holds clicks, `roas` impressions (spend doesn't apply here).
  const typed = rows.map((r) => ({
    date: String(r.keys?.[0] ?? ""),
    clicks: Number(r.clicks ?? 0),
    impressions: Number(r.impressions ?? 0),
    position: Number(r.position ?? 0),
  }));
  const cur = typed.filter((r) => r.date >= w.curStart);
  const prev = typed.filter((r) => r.date && r.date < w.curStart);
  if (!cur.length) return null;

  const agg = (rs: typeof typed) => {
    const clicks = sum(rs, (r) => r.clicks);
    const impressions = sum(rs, (r) => r.impressions);
    // Average position weighted by impressions, like Search Console itself.
    const position = impressions ? sum(rs, (r) => r.position * r.impressions) / impressions : 0;
    return { clicks, impressions, position };
  };
  const c = agg(cur);
  const p = prev.length ? agg(prev) : null;

  return {
    series: typed.map((r) => ({ date: r.date, spend: 0, leads: Math.round(r.clicks), roas: Math.round(r.impressions) })),
    kpis: [
      { metric_name: "clicks", label: "Organic Clicks", value: Math.round(c.clicks), unit: "number", delta: change(c.clicks, p?.clicks), period: PERIOD, source: "Search Console" },
      { metric_name: "impressions", label: "Impressions", value: Math.round(c.impressions), unit: "number", delta: change(c.impressions, p?.impressions), period: PERIOD, source: "Search Console" },
      // Lower position is better, so the change is reported as-is and the UI
      // treats a negative change as an improvement.
      { metric_name: "avg_position", label: "Avg. Position", value: Number(c.position.toFixed(1)), unit: "number", delta: c.position && p?.position ? change(c.position, p.position) : null, period: PERIOD, source: "Search Console" },
    ],
  };
}
