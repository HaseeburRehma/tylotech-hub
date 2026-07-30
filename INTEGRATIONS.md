# Live data integrations (Meta Ads & Google Search Console)

The adapters (`src/lib/integrations/fetchers.ts`) and sync (`/api/integrations/sync`) are
wired. There are **two ways** to feed a real access token per client — pick either.

## Where the admin manages this
Internal Hub → open a client → **Metrics & APIs** tab → *Connected data sources*.
For each provider: **Connect** → set the **account/site** → paste an **API access token** →
**Sync**. Synced data lands on that client's dashboard (and updates live via realtime).

The token is stored on `integrations.access_token` and is **never sent to the browser**
(the UI only shows whether one is set). Sync runs server-side.

---

## Option A — Paste a token (fastest, no app review)

**Meta Ads**
1. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select your app, add permission `ads_read`, generate a token.
3. In the client's Meta Ads card: set **Ad account ID** (e.g. `act_1234567890`) and paste the token → **Sync**.

**Google Search Console**
1. Get an OAuth token with scope `https://www.googleapis.com/auth/webmasters.readonly`
   (e.g. via the [OAuth Playground](https://developers.google.com/oauthplayground/)).
2. In the Search Console card: set **Property/site URL** (e.g. `https://example.com/`) and paste the token → **Sync**.

> Explorer/Playground tokens are short-lived — good for testing. Use Option B for production.

## Option B — Full OAuth (production, tokens auto-managed)

Register apps once, then clients connect via the **Connect** button (OAuth flow already built:
`/api/integrations/[provider]/oauth/start` → `/api/integrations/oauth/callback`).

**Meta app** — [developers.facebook.com](https://developers.facebook.com/) → Create app (Business) →
add **Marketing API** → add OAuth redirect URI:
`https://YOUR_DOMAIN/api/integrations/oauth/callback` → copy App ID/Secret to env:
```
META_APP_ID=...
META_APP_SECRET=...
```

**Google app** — [console.cloud.google.com](https://console.cloud.google.com/) → new project →
enable **Search Console API** (and Google Ads / Analytics as needed) → OAuth consent screen →
Credentials → OAuth client (Web) → authorized redirect URI:
`https://YOUR_DOMAIN/api/integrations/oauth/callback` → copy to env:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...   # only for Google Ads
```

When these env vars are present, the Connect button routes through real OAuth and stores
the resulting tokens automatically — no manual paste needed.

## What sync writes
- **Meta Ads** → daily `metric_points` (spend/leads/ROAS) → dashboard chart + KPIs
- **Search Console** → KPIs (clicks/impressions/avg position)
- Only the **synced source's** KPIs are replaced; manually-entered KPIs are preserved.
