import { fetchWithRetry } from "@/lib/http";
import { GOOGLE_ADS_VERSION, META_GRAPH_VERSION, errorFor, metaLeads } from "@/lib/integrations/fetchers";
import type { AdStat, CampaignStat } from "@/lib/campaign-classify";

/**
 * Spend per campaign and per ad (creative) for a date range, straight from the
 * ad platforms, so the Leads page can say which campaign and creative each
 * lead came from and what it cost. Numbers match Ads Manager / Google Ads for
 * the same days (account time zone).
 */

export type StatsResult = { campaigns: CampaignStat[]; currency: string } | { error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Meta: ad-level insights (spend, impressions, clicks, leads) + creative thumbnails. */
export async function metaCampaignStats(token: string, accountId: string, since: string | null, until: string | null): Promise<StatsResult> {
  if (!token || !accountId) return { error: "Meta Ads is not connected." };
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const base = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
  const params = new URLSearchParams({
    level: "ad",
    fields: "ad_id,ad_name,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions",
    limit: "500",
    access_token: token,
  });
  if (since && until) params.set("time_range", JSON.stringify({ since, until }));
  else params.set("date_preset", "maximum");

  const rows: any[] = [];
  let next: string | null = `${base}/${acct}/insights?${params}`;
  for (let page = 0; next && page < 20; page++) {
    const res: Response | null = await fetchWithRetry(next, { cache: "no-store" });
    if (!res?.ok) return { error: (await errorFor(res)).detail ?? "Meta request failed." };
    const json: any = await res.json().catch(() => null);
    if (!json) return { error: "Meta returned no data." };
    rows.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }

  // Currency of the ad account (spend is in it).
  const acc: any = await fetchWithRetry(`${base}/${acct}?${new URLSearchParams({ fields: "currency", access_token: token })}`, { cache: "no-store" })
    .then((r) => (r?.ok ? r.json() : null))
    .catch(() => null);

  // Creative thumbnails, 50 ads per request.
  const thumbs = new Map<string, string>();
  const ids = Array.from(new Set(rows.map((r) => String(r.ad_id ?? "")).filter(Boolean)));
  for (let i = 0; i < ids.length; i += 50) {
    const q = new URLSearchParams({ ids: ids.slice(i, i + 50).join(","), fields: "creative{thumbnail_url,image_url}", access_token: token });
    const j: any = await fetchWithRetry(`${base}/?${q}`, { cache: "no-store" })
      .then((r) => (r?.ok ? r.json() : null))
      .catch(() => null);
    for (const [id, ad] of Object.entries(j ?? {})) {
      const url = (ad as any)?.creative?.thumbnail_url ?? (ad as any)?.creative?.image_url;
      if (typeof url === "string" && url.startsWith("https://")) thumbs.set(id, url);
    }
  }

  const byCampaign = new Map<string, CampaignStat>();
  for (const r of rows) {
    const cid = String(r.campaign_id ?? r.campaign_name ?? "?");
    let c = byCampaign.get(cid);
    if (!c) {
      c = { id: cid, name: String(r.campaign_name ?? "Kampagne"), platform: "meta", spend: 0, impressions: 0, clicks: 0, platformLeads: 0, ads: [] };
      byCampaign.set(cid, c);
    }
    const ad: AdStat = {
      id: String(r.ad_id ?? ""),
      name: String(r.ad_name ?? "Anzeige"),
      adset: r.adset_name ? String(r.adset_name) : null,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      platformLeads: metaLeads(r.actions),
      thumbnail: thumbs.get(String(r.ad_id ?? "")) ?? null,
    };
    c.ads.push(ad);
    c.spend += ad.spend;
    c.impressions += ad.impressions;
    c.clicks += ad.clicks;
    c.platformLeads += ad.platformLeads;
  }
  const campaigns = Array.from(byCampaign.values()).map((c) => ({ ...c, spend: round2(c.spend), ads: c.ads.sort((a, b) => b.spend - a.spend) }));
  return { campaigns, currency: String(acc?.currency ?? "EUR") };
}

/** Google Ads: campaign + ad group level (ad groups stand in for creatives). */
export async function googleCampaignStats(
  accessToken: string,
  customerId: string,
  loginCustomerId: string | null | undefined,
  since: string | null,
  until: string | null,
): Promise<StatsResult> {
  const cid = (customerId ?? "").replace(/[^0-9]/g, "");
  if (!accessToken || !cid) return { error: "Google Ads is not connected." };
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const login = (loginCustomerId || "").replace(/[^0-9]/g, "");
  if (login && login !== cid) headers["login-customer-id"] = login;
  const safe = (d: string | null, fb: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fb);
  const from = safe(since, "2015-01-01");
  const to = safe(until, new Date().toISOString().slice(0, 10));

  const search = async (query: string) => {
    const res = await fetchWithRetry(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/googleAds:searchStream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return { error: (await errorFor(res)).detail ?? "Google Ads request failed." };
    const json: any = await res.json().catch(() => null);
    return { results: ((Array.isArray(json) ? json : [json]) as any[]).flatMap((b) => b?.results ?? []) };
  };

  const r = await search(
    `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM ad_group WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0`,
  );
  if ("error" in r) return { error: r.error ?? "Google Ads request failed." };
  const cur = await search("SELECT customer.currency_code FROM customer LIMIT 1");
  const currency = "results" in cur ? String(cur.results?.[0]?.customer?.currencyCode ?? "EUR") : "EUR";

  const byCampaign = new Map<string, CampaignStat>();
  for (const row of r.results) {
    const id = String(row.campaign?.id ?? "?");
    let c = byCampaign.get(id);
    if (!c) {
      c = { id, name: String(row.campaign?.name ?? "Kampagne"), platform: "google", spend: 0, impressions: 0, clicks: 0, platformLeads: 0, ads: [] };
      byCampaign.set(id, c);
    }
    const ad: AdStat = {
      id: String(row.adGroup?.id ?? ""),
      name: String(row.adGroup?.name ?? "Anzeigengruppe"),
      adset: null,
      spend: Number(row.metrics?.costMicros ?? 0) / 1_000_000,
      impressions: Number(row.metrics?.impressions ?? 0),
      clicks: Number(row.metrics?.clicks ?? 0),
      platformLeads: Math.round(Number(row.metrics?.conversions ?? 0) * 10) / 10,
      thumbnail: null,
    };
    c.ads.push(ad);
    c.spend += ad.spend;
    c.impressions += ad.impressions;
    c.clicks += ad.clicks;
    c.platformLeads += ad.platformLeads;
  }
  const campaigns = Array.from(byCampaign.values()).map((c) => ({
    ...c,
    spend: round2(c.spend),
    platformLeads: Math.round(c.platformLeads * 10) / 10,
    ads: c.ads.map((a) => ({ ...a, spend: round2(a.spend) })).sort((a, b) => b.spend - a.spend),
  }));
  return { campaigns, currency };
}
