import { getProvider, type ProviderId } from "./providers";

/**
 * Pulls metrics for a provider.
 *
 * Today this returns a deterministic sandbox snapshot so the feature is fully usable
 * before live API credentials exist. When real OAuth tokens are stored on the
 * integration row, replace the body of `fetchLiveMetrics` with the provider's API call
 * (Meta Graph API, Google Ads API, GA4 Data API, Search Console API) — the surrounding
 * connect/sync/persist flow stays identical.
 */
export function generateMetrics(provider: ProviderId, seed = 1): Record<string, number> {
  const p = getProvider(provider);
  if (!p) return {};
  // Deterministic pseudo-noise (no Math.random → stable across renders/instances).
  const noise = (i: number) => Math.abs((Math.sin((seed + i) * 12.9898) * 43758.5453) % 1);

  const out: Record<string, number> = {};
  p.metrics.forEach((m, i) => {
    const r = noise(i);
    switch (m.unit) {
      case "currency":
        out[m.key] = Math.round(2000 + r * 18000);
        break;
      case "ratio":
        out[m.key] = Number((2 + r * 4).toFixed(2));
        break;
      case "percent":
        out[m.key] = Number((1 + r * 6).toFixed(2));
        break;
      default:
        out[m.key] = Math.round(50 + r * 5000);
    }
  });
  return out;
}
