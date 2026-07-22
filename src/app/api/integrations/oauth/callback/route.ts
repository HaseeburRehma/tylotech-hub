import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { oauthConfig } from "@/lib/integrations/oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (params: string) => NextResponse.redirect(`${origin}/integrations?${params}`);

  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return done(`error=${url.searchParams.get("error")}`);
  if (!code || !state) return done("error=oauth_failed");

  let provider = "", clientId = "";
  try {
    ({ provider, clientId } = JSON.parse(Buffer.from(state, "base64url").toString()));
  } catch {
    return done("error=bad_state");
  }

  // Clients can only complete OAuth for their own tenant.
  if (user.role === "client" && clientId !== user.client_id) return done("error=forbidden");

  const cfg = oauthConfig(provider);
  const admin = createAdminClient();
  if (!cfg || !admin) return done("error=not_configured");

  // Exchange the authorization code for tokens.
  const redirectUri = `${origin}/api/integrations/oauth/callback`;
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }).catch(() => null);

  const token = tokenRes ? await tokenRes.json().catch(() => null) : null;
  if (!token?.access_token) return done("error=token_exchange");

  await admin.from("integrations").upsert(
    {
      client_id: clientId,
      provider,
      status: "connected",
      account_label: `${provider} (live)`,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
    },
    { onConflict: "client_id,provider" },
  );

  return done(`connected=${provider}`);
}
