/**
 * Leads by campaign and creative, joined with what the ad platforms spent
 * (pure, client-safe). A lead belongs to the campaign and ad it names, by name
 * or by id (Meta lead forms carry names; website leads utm ids, Google's
 * gad_campaignid or the campaign and ad group behind their gclid). Leads
 * without one are grouped by how they arrived.
 */

export interface AdStat {
  id: string;
  name: string;
  adset: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  /** Leads/conversions the ad platform itself reports. */
  platformLeads: number;
  thumbnail: string | null;
}

export interface CampaignStat {
  id: string;
  name: string;
  platform: "meta" | "google";
  spend: number;
  impressions: number;
  clicks: number;
  platformLeads: number;
  ads: AdStat[];
}

export interface LeadForClassify {
  id: string;
  source: string;
  platform: string | null;
  campaign: string | null;
  ad_group: string | null;
  ad: string | null;
  status: string;
  is_test: boolean;
}

export type GroupKind = "meta" | "google" | "website_google" | "website_meta" | "website" | "organic" | "manual";

export interface AdRow {
  key: string;
  name: string;
  adset: string | null;
  thumbnail: string | null;
  spend: number | null;
  platformLeads: number | null;
  leads: number;
  won: number;
  cpl: number | null;
  leadIds: string[];
}

export interface CampaignRow {
  key: string;
  name: string;
  kind: GroupKind;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  platformLeads: number | null;
  leads: number;
  won: number;
  cpl: number | null;
  ads: AdRow[];
  /** Lead ids in this group (to filter the table). */
  leadIds: string[];
}

/** What a lead's campaign and ad resolved to (names, also when the lead only had ids). */
export interface LeadLabel {
  campaign: string;
  ad: string | null;
  adset: string | null;
  thumbnail: string | null;
}

export const norm = (s: string | null | undefined) => (s ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("de");

/** Which group a lead without a matching ad campaign belongs to. */
function fallbackKind(l: LeadForClassify): GroupKind {
  if (l.source === "manual") return "manual";
  if (l.source === "meta") return l.campaign && /organisch|organic/i.test(l.campaign) ? "organic" : "meta";
  if (l.source === "google_ads") return "google";
  const p = (l.platform ?? "").toLowerCase();
  if (p === "google") return "website_google";
  if (p === "facebook" || p === "instagram" || p === "meta") return "website_meta";
  return "website";
}

export const GROUP_LABEL: Record<GroupKind, { de: string; en: string }> = {
  meta: { de: "Meta, ohne Kampagnenzuordnung", en: "Meta, no campaign match" },
  google: { de: "Google Ads Lead-Formular", en: "Google Ads lead form" },
  website_google: { de: "Website, über Google-Anzeige", en: "Website, via Google ad" },
  website_meta: { de: "Website, über Meta-Anzeige", en: "Website, via Meta ad" },
  website: { de: "Website / direkt", en: "Website / direct" },
  organic: { de: "Meta organisch", en: "Meta organic" },
  manual: { de: "Manuell erfasst", en: "Added by hand" },
};

// No spend in the range (paused campaign, leads from earlier clicks) → no CPL, not "€0".
const cplOf = (spend: number | null, leads: number) => (spend != null && spend > 0 && leads > 0 ? Math.round((spend / leads) * 100) / 100 : null);

/**
 * Join leads (already filtered to the date range) with platform stats for the
 * same range. Test and invalid leads don't count.
 */
export function classifyLeads(
  leads: LeadForClassify[],
  campaigns: CampaignStat[],
  lang: "de" | "en" = "de",
): { rows: CampaignRow[]; totals: { spend: number; leads: number; platformLeads: number; cpl: number | null; unmatched: number }; labels: Map<string, LeadLabel> } {
  const counted = leads.filter((l) => !l.is_test && l.status !== "invalid");
  const rows = new Map<string, CampaignRow>();
  // Ids → the row / ad they belong to (several campaign ids can share a name row).
  const rowById = new Map<string, CampaignRow>();
  const adById = new Map<string, AdRow>();
  const idOf = (s: string | null) => (s && /^\d{5,24}$/.test(s.trim()) ? s.trim() : null);

  // Platform campaigns first (by name per platform, so spend is never split).
  for (const c of campaigns) {
    const key = `${c.platform}:${norm(c.name)}`;
    const prev = rows.get(key);
    const ads: AdRow[] = c.ads.map((a) => ({
      key: `${key}|${norm(a.adset)}|${norm(a.name)}`,
      name: a.name,
      adset: a.adset,
      thumbnail: a.thumbnail,
      spend: a.spend,
      platformLeads: a.platformLeads,
      leads: 0,
      won: 0,
      cpl: null,
      leadIds: [],
    }));
    c.ads.forEach((a, i) => a.id && adById.set(a.id, ads[i]));
    if (prev) {
      rowById.set(c.id, prev);
      prev.spend = (prev.spend ?? 0) + c.spend;
      prev.impressions = (prev.impressions ?? 0) + c.impressions;
      prev.clicks = (prev.clicks ?? 0) + c.clicks;
      prev.platformLeads = (prev.platformLeads ?? 0) + c.platformLeads;
      prev.ads.push(...ads);
    } else {
      const row: CampaignRow = { key, name: c.name, kind: c.platform, spend: c.spend, impressions: c.impressions, clicks: c.clicks, platformLeads: c.platformLeads, leads: 0, won: 0, cpl: null, ads, leadIds: [] };
      rows.set(key, row);
      rowById.set(c.id, row);
    }
  }

  let unmatched = 0;
  const labels = new Map<string, LeadLabel>();
  for (const l of counted) {
    const platformKey = l.source === "meta" || ["facebook", "instagram"].includes((l.platform ?? "").toLowerCase()) ? "meta" : "google";
    const campaignId = idOf(l.campaign);
    let row = l.campaign
      ? (campaignId ? rowById.get(campaignId) : undefined) ??
        rows.get(`${platformKey}:${norm(l.campaign)}`) ??
        rows.get(`${platformKey === "meta" ? "google" : "meta"}:${norm(l.campaign)}`)
      : undefined;
    if (!row && l.campaign && l.source === "meta" && !/organisch|organic/i.test(l.campaign)) {
      // A Meta campaign with no spend in this range (paused, or leads from before): still its own row.
      const key = `meta:${norm(l.campaign)}`;
      row = { key, name: l.campaign, kind: "meta", spend: 0, impressions: 0, clicks: 0, platformLeads: 0, leads: 0, won: 0, cpl: null, ads: [], leadIds: [] };
      rows.set(key, row);
    }
    if (!row) {
      unmatched++;
      const kind = fallbackKind(l);
      const key = `group:${kind}`;
      row = rows.get(key);
      if (!row) {
        row = { key, name: GROUP_LABEL[kind][lang], kind, spend: null, impressions: null, clicks: null, platformLeads: null, leads: 0, won: 0, cpl: null, ads: [], leadIds: [] };
        rows.set(key, row);
      }
    }
    row.leads++;
    row.leadIds.push(l.id);
    if (l.status === "won") row.won++;
    if (row.spend === null) continue;
    // The ad by id (Meta ad id; for Google the ad group id), else by name.
    const r = row;
    const byId = [idOf(l.ad), idOf(l.ad_group)].map((id) => (id ? adById.get(id) : undefined)).find((a) => a && r.ads.includes(a));
    let ad: AdRow | undefined = byId;
    if (!ad && l.ad) {
      // Same ad name in two ad sets: prefer the one the lead names.
      const exact = row.ads.find((a) => norm(a.name) === norm(l.ad) && norm(a.adset) === norm(l.ad_group));
      ad = exact ?? row.ads.find((a) => norm(a.name) === norm(l.ad));
      if (!ad && !idOf(l.ad)) {
        ad = { key: `${row.key}|${norm(l.ad_group)}|${norm(l.ad)}`, name: l.ad, adset: l.ad_group, thumbnail: null, spend: 0, platformLeads: 0, leads: 0, won: 0, cpl: null, leadIds: [] };
        row.ads.push(ad);
      }
    }
    if (ad) {
      ad.leads++;
      ad.leadIds.push(l.id);
      if (l.status === "won") ad.won++;
    }
    labels.set(l.id, { campaign: row.name, ad: ad?.name ?? (idOf(l.ad) ? null : l.ad), adset: ad?.adset ?? (idOf(l.ad_group) ? null : l.ad_group), thumbnail: ad?.thumbnail ?? null });
  }

  const out = Array.from(rows.values())
    .map((r) => ({
      ...r,
      spend: r.spend == null ? null : Math.round(r.spend * 100) / 100,
      cpl: cplOf(r.spend, r.leads),
      ads: r.ads
        .map((a) => ({ ...a, cpl: cplOf(a.spend, a.leads) }))
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0) || b.leads - a.leads),
    }))
    // Campaigns that neither spent nor brought a lead in this range add noise.
    .filter((r) => r.leads > 0 || (r.spend ?? 0) > 0)
    .sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1) || b.leads - a.leads);

  const spend = out.reduce((n, r) => n + (r.spend ?? 0), 0);
  const leadsTotal = out.reduce((n, r) => n + r.leads, 0);
  const paidLeads = out.filter((r) => r.spend != null).reduce((n, r) => n + r.leads, 0);
  return {
    rows: out,
    totals: {
      spend: Math.round(spend * 100) / 100,
      leads: leadsTotal,
      platformLeads: out.reduce((n, r) => n + (r.platformLeads ?? 0), 0),
      // Cost per lead over leads that came from paid campaigns.
      cpl: cplOf(spend, paidLeads),
      unmatched,
    },
    labels,
  };
}
