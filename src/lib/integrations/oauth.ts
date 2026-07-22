import type { ProviderId } from "./providers";

interface OAuthConfigDef {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthParams?: Record<string, string>;
}

/**
 * OAuth definitions per provider. Real credentials come from env; when absent the
 * integration falls back to the sandbox provider (see providers.ts / sync.ts).
 * This is the seam that turns sandbox integrations into live ones — add the app
 * credentials and the Connect button routes through real OAuth automatically.
 */
const OAUTH: Record<ProviderId, OAuthConfigDef> = {
  meta_ads: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scope: "ads_read",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
  },
  google_ads: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/adwords",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  ga4: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  search_console: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
};

export interface ResolvedOAuth extends OAuthConfigDef {
  clientId: string;
  clientSecret: string;
}

/** Returns a fully-resolved config only when both credentials are present. */
export function oauthConfig(provider: string): ResolvedOAuth | null {
  const def = OAUTH[provider as ProviderId];
  if (!def) return null;
  const clientId = process.env[def.clientIdEnv];
  const clientSecret = process.env[def.clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { ...def, clientId, clientSecret };
}
