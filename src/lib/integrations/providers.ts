export type ProviderId = "meta_ads" | "google_ads" | "ga4" | "search_console";

export interface IntegrationProvider {
  id: ProviderId;
  name: string;
  description: string;
  category: "Ads" | "Analytics" | "SEO";
  /** Metric keys this provider produces (shown after a sync). */
  metrics: { key: string; label: string; unit: "currency" | "number" | "ratio" | "percent" }[];
  /** Env var that, when present, unlocks the real OAuth flow (else sandbox). */
  liveEnv: string;
}

export const PROVIDERS: IntegrationProvider[] = [
  {
    id: "meta_ads",
    name: "Meta Ads",
    description: "Facebook & Instagram ad spend, leads, ROAS.",
    category: "Ads",
    liveEnv: "META_APP_ID",
    metrics: [
      { key: "spend", label: "Ad Spend", unit: "currency" },
      { key: "leads", label: "Leads", unit: "number" },
      { key: "roas", label: "ROAS", unit: "ratio" },
    ],
  },
  {
    id: "google_ads",
    name: "Google Ads",
    description: "Search & display campaign performance.",
    category: "Ads",
    liveEnv: "GOOGLE_ADS_DEVELOPER_TOKEN",
    metrics: [
      { key: "spend", label: "Ad Spend", unit: "currency" },
      { key: "conversions", label: "Conversions", unit: "number" },
      { key: "cpc", label: "Avg. CPC", unit: "currency" },
    ],
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    description: "Sessions, users and conversion tracking.",
    category: "Analytics",
    liveEnv: "GOOGLE_CLIENT_ID",
    metrics: [
      { key: "users", label: "Users", unit: "number" },
      { key: "sessions", label: "Sessions", unit: "number" },
      { key: "convRate", label: "Conv. Rate", unit: "percent" },
    ],
  },
  {
    id: "search_console",
    name: "Search Console",
    description: "Organic clicks, impressions and rankings.",
    category: "SEO",
    liveEnv: "GOOGLE_CLIENT_ID",
    metrics: [
      { key: "clicks", label: "Clicks", unit: "number" },
      { key: "impressions", label: "Impressions", unit: "number" },
      { key: "position", label: "Avg. Position", unit: "number" },
    ],
  },
];

export function getProvider(id: string): IntegrationProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** True when real API credentials are configured for this provider. */
export function isProviderLive(p: IntegrationProvider): boolean {
  return Boolean(process.env[p.liveEnv]);
}
