/**
 * Real provider data fetchers. Given the OAuth access token stored on an integration
 * row (from the OAuth callback) plus its account config (ad-account id / GSC site url),
 * these call the live provider APIs and return normalized KPIs + a daily series.
 *
 * They return null when credentials/config are missing — the sync then writes nothing
 * (no dummy data). Wire real credentials via the admin Integrations panel + OAuth.
 */
export interface FetchedData {
  series: { date: string; spend: number; leads: number; roas: number }[];
  kpis: {
    metric_name: string;
    label: string;
    value: number;
    unit: "currency" | "number" | "percent" | "ratio";
    delta: number;
    period: string;
    source: string;
  }[];
}

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Meta Marketing API — daily ad insights for an ad account. */
export async function fetchMetaAds(
  accessToken: string,
  accountId: string,
  days = 30,
): Promise<FetchedData | null> {
  if (!accessToken || !accountId) return null;
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const url = `https://graph.facebook.com/v19.0/${acct}/insights?fields=spend,actions,purchase_roas&time_increment=1&date_preset=last_30d&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const json: any = await res.json();
  const rows: any[] = json.data ?? [];

  const series = rows.map((r) => {
    const leads = Number(
      (r.actions ?? []).find((a: any) => /lead/i.test(a.action_type))?.value ?? 0,
    );
    const roas = Number(r.purchase_roas?.[0]?.value ?? 0);
    return { date: r.date_start, spend: Number(r.spend ?? 0), leads, roas };
  });

  const totalSpend = series.reduce((a, p) => a + p.spend, 0);
  const totalLeads = series.reduce((a, p) => a + p.leads, 0);
  const avgRoas = series.length ? series.reduce((a, p) => a + p.roas, 0) / series.length : 0;

  return {
    series,
    kpis: [
      { metric_name: "ad_spend", label: "Monthly Ad Spend", value: Math.round(totalSpend), unit: "currency", delta: 0, period: "Last 30d", source: "Meta Ads" },
      { metric_name: "leads", label: "Leads Generated", value: totalLeads, unit: "number", delta: 0, period: "Last 30d", source: "Meta Ads" },
      { metric_name: "roas", label: "ROAS", value: Number(avgRoas.toFixed(1)), unit: "ratio", delta: 0, period: "Last 30d", source: "Meta Ads" },
    ],
  };
}

/** Google Analytics 4 — Data API runReport for a property (needs numeric propertyId). */
export async function fetchGa4(
  accessToken: string,
  propertyId: string,
  days = 30,
): Promise<FetchedData | null> {
  if (!accessToken || !propertyId) return null;
  const id = propertyId.replace(/[^0-9]/g, ""); // Data API needs the numeric property id, not "G-..."
  if (!id) return null;
  const { start, end } = dateRange(days);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: start, endDate: end }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "conversions" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      cache: "no-store",
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const json: any = await res.json();
  const rows: any[] = json.rows ?? [];

  const users = rows.reduce((a, r) => a + Number(r.metricValues?.[0]?.value ?? 0), 0);
  const sessions = rows.reduce((a, r) => a + Number(r.metricValues?.[1]?.value ?? 0), 0);
  const conversions = rows.reduce((a, r) => a + Number(r.metricValues?.[2]?.value ?? 0), 0);
  const convRate = sessions ? Number(((conversions / sessions) * 100).toFixed(2)) : 0;

  return {
    series: [], // GA4 headline KPIs only — the chart is driven by Ads/GSC series.
    kpis: [
      { metric_name: "users", label: "Users", value: Math.round(users), unit: "number", delta: 0, period: "Last 30d", source: "GA4" },
      { metric_name: "sessions", label: "Sessions", value: Math.round(sessions), unit: "number", delta: 0, period: "Last 30d", source: "GA4" },
      { metric_name: "conv_rate", label: "Conversion Rate", value: convRate, unit: "percent", delta: 0, period: "Last 30d", source: "GA4" },
    ],
  };
}

/** Google Ads — daily campaign metrics for a customer (needs approved developer token). */
export async function fetchGoogleAds(
  accessToken: string,
  customerId: string,
  days = 30,
): Promise<FetchedData | null> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const cid = (customerId ?? "").replace(/[^0-9]/g, "");
  if (!accessToken || !cid || !devToken) return null;
  const { start, end } = dateRange(days);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  const loginCid = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/[^0-9]/g, "");
  if (loginCid) headers["login-customer-id"] = loginCid;

  const query = `SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`;
  const res = await fetch(`https://googleads.googleapis.com/v17/customers/${cid}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const json: any = await res.json();
  // searchStream returns an array of batches, each with a results[] array.
  const batches: any[] = Array.isArray(json) ? json : [json];
  const results: any[] = batches.flatMap((b) => b.results ?? []);

  const byDate: Record<string, { spend: number; leads: number; value: number }> = {};
  for (const r of results) {
    const d = r.segments?.date;
    if (!d) continue;
    const spend = Number(r.metrics?.costMicros ?? 0) / 1_000_000;
    const leads = Number(r.metrics?.conversions ?? 0);
    const value = Number(r.metrics?.conversionsValue ?? 0);
    byDate[d] = byDate[d] || { spend: 0, leads: 0, value: 0 };
    byDate[d].spend += spend;
    byDate[d].leads += leads;
    byDate[d].value += value;
  }
  const series = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, spend: Math.round(v.spend), leads: Math.round(v.leads), roas: v.spend ? Number((v.value / v.spend).toFixed(2)) : 0 }));

  const totalSpend = series.reduce((a, p) => a + p.spend, 0);
  const totalLeads = series.reduce((a, p) => a + p.leads, 0);
  const totalValue = Object.values(byDate).reduce((a, v) => a + v.value, 0);
  const roas = totalSpend ? Number((totalValue / totalSpend).toFixed(1)) : 0;

  return {
    series,
    kpis: [
      { metric_name: "ad_spend", label: "Monthly Ad Spend", value: Math.round(totalSpend), unit: "currency", delta: 0, period: "Last 30d", source: "Google Ads" },
      { metric_name: "leads", label: "Conversions", value: Math.round(totalLeads), unit: "number", delta: 0, period: "Last 30d", source: "Google Ads" },
      { metric_name: "roas", label: "ROAS", value: roas, unit: "ratio", delta: 0, period: "Last 30d", source: "Google Ads" },
    ],
  };
}

/** Google Search Console — daily search analytics for a verified property. */
export async function fetchSearchConsole(
  accessToken: string,
  siteUrl: string,
  days = 30,
): Promise<FetchedData | null> {
  if (!accessToken || !siteUrl) return null;
  const { start, end } = dateRange(days);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date"], rowLimit: days }),
      cache: "no-store",
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const json: any = await res.json();
  const rows: any[] = json.rows ?? [];

  // Map GSC clicks→leads proxy so the shared series shape stays consistent.
  const series = rows.map((r) => ({
    date: r.keys?.[0],
    spend: 0,
    leads: Math.round(Number(r.clicks ?? 0)),
    roas: 0,
  }));
  const totalClicks = rows.reduce((a, r) => a + Number(r.clicks ?? 0), 0);
  const totalImpr = rows.reduce((a, r) => a + Number(r.impressions ?? 0), 0);
  const avgPos = rows.length ? rows.reduce((a, r) => a + Number(r.position ?? 0), 0) / rows.length : 0;

  return {
    series,
    kpis: [
      { metric_name: "clicks", label: "Organic Clicks", value: Math.round(totalClicks), unit: "number", delta: 0, period: "Last 30d", source: "Search Console" },
      { metric_name: "impressions", label: "Impressions", value: Math.round(totalImpr), unit: "number", delta: 0, period: "Last 30d", source: "Search Console" },
      { metric_name: "avg_position", label: "Avg. Position", value: Number(avgPos.toFixed(1)), unit: "number", delta: 0, period: "Last 30d", source: "Search Console" },
    ],
  };
}
