import type { SeriesPoint } from "@/types";

export interface ProviderSeriesPoint extends SeriesPoint {
  provider: string;
  /** Search Console only: daily average position. */
  position?: number | null;
}

const AD_PROVIDERS = new Set(["meta_ads", "google_ads"]);

/**
 * Sum clients per provider + day. Counts add up; ROAS is weighted by spend and
 * Search Console position by impressions (stored in `roas` for that source),
 * so the portfolio numbers mean what they mean for a single client.
 */
export function combinePortfolio(points: ProviderSeriesPoint[]): ProviderSeriesPoint[] {
  const acc = new Map<string, { p: ProviderSeriesPoint; value: number; posWeight: number; posSum: number }>();
  for (const p of points) {
    const key = `${p.provider}|${p.date}`;
    const a = acc.get(key) ?? { p: { date: p.date, provider: p.provider, spend: 0, leads: 0, roas: 0, position: null }, value: 0, posWeight: 0, posSum: 0 };
    a.p.spend += p.spend;
    a.p.leads += p.leads;
    if (AD_PROVIDERS.has(p.provider)) a.value += p.roas * p.spend;
    else a.p.roas += p.roas;
    if (p.position != null && p.roas > 0) {
      a.posSum += p.position * p.roas;
      a.posWeight += p.roas;
    }
    acc.set(key, a);
  }
  return Array.from(acc.values())
    .map(({ p, value, posSum, posWeight }) => ({
      ...p,
      roas: AD_PROVIDERS.has(p.provider) ? (p.spend ? Number((value / p.spend).toFixed(2)) : 0) : p.roas,
      position: posWeight ? Number((posSum / posWeight).toFixed(2)) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.provider.localeCompare(b.provider));
}

