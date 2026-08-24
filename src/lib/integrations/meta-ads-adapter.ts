import { fetchMetaAds } from "@/lib/integrations/fetchers";
import type { FetchedData } from "@/lib/integrations/fetchers";

/**
 * Meta Ads reporting adapter — the ONE seam for how TyloHub pulls Meta KPIs.
 *
 * Today it is backed by the Meta Graph/Marketing API (verified, working). The
 * brief (22 Aug 2026) wants us to move to Meta's official first-party MCP server:
 *
 *     META_MCP_ENDPOINT = https://mcp.facebook.com/ads   (launched 16 Jul 2026)
 *
 * That endpoint's exact protocol, tool names, request/response shapes and auth
 * scopes must come from Meta's own docs + a token from our Meta app — they are
 * NOT guessed here. When those are confirmed, implement `fetchViaMcp()` below and
 * flip `USE_MCP` (or gate it on an env flag). Every caller already goes through
 * `fetchMetaAdsKpis`, so the swap is a single-file change with no ripple.
 *
 * Auth notes to confirm before enabling MCP (the brief's gate):
 *  - Which token the MCP endpoint accepts: the app's user access token with
 *    `ads_read`, or a long-lived System User token from Business Manager.
 *  - Whether it rides on the existing app / Cloud API access or needs separate
 *    setup — this is the item that may block on the Cloud API application.
 *  - Whether reporting is read-only by default (start read-only per the brief).
 *
 * Marketing API v26.0 (29 Jul 2026) watch-out: special ad categories now need an
 * explicit Advantage+ audience flag and some placements were removed. Relevant
 * for Light of Hope (health-adjacent) IF/when this adapter touches campaign
 * structures. Reporting-only reads (the current scope) are unaffected.
 */

export const META_MCP_ENDPOINT = "https://mcp.facebook.com/ads";

/** Flip to true once fetchViaMcp() is implemented against the real MCP contract. */
const USE_MCP = false;

/**
 * Pull Meta Ads KPIs for an ad account. Returns null on no-token / bad-config /
 * false-zero (see fetchMetaAds), so a failed pull never overwrites good data.
 */
export async function fetchMetaAdsKpis(accessToken: string, accountId: string): Promise<FetchedData | null> {
  if (USE_MCP) return fetchViaMcp(accessToken, accountId);
  return fetchMetaAds(accessToken, accountId);
}

/**
 * TODO(meta-mcp): implement against the real mcp.facebook.com/ads contract once
 * Meta's docs + a token are available. It must return the same FetchedData shape
 * (series[] + kpis[] incl. leads and cost-per-lead) and apply the same false-zero
 * guard, so the rest of TyloHub is unchanged. Intentionally not stubbed with a
 * fabricated protocol.
 */
async function fetchViaMcp(_accessToken: string, _accountId: string): Promise<FetchedData | null> {
  throw new Error("Meta MCP backend not implemented yet — set USE_MCP=false or implement fetchViaMcp().");
}
