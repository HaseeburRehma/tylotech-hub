import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { META_GRAPH_VERSION } from "@/lib/integrations/fetchers";
import { oauthConfig } from "@/lib/integrations/oauth";

export const runtime = "nodejs";

const NONCE_COOKIE = "oauth_nonce";

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

  let provider = "", clientId = "", nonce = "";
  try {
    ({ provider, clientId, nonce } = JSON.parse(Buffer.from(state, "base64url").toString()));
  } catch {
    return done("error=bad_state");
  }

  // `state` is otherwise attacker-constructible base64 JSON — require it to
  // carry the exact nonce this server issued to THIS browser at /oauth/start,
  // so a forged callback link (attacker's own code + a hand-picked clientId)
  // can't be replayed under someone else's authenticated session.
  const cookieStore = cookies();
  const expectedNonce = cookieStore.get(NONCE_COOKIE)?.value;
  cookieStore.delete(NONCE_COOKIE);
  if (!nonce || !expectedNonce || nonce !== expectedNonce) return done("error=bad_state");

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

  // Meta's OAuth code yields a ~1-2h user token; swap it for the long-lived
  // (~60 day) one so the daily sync keeps working.
  if (provider === "meta_ads") {
    const ll = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        fb_exchange_token: token.access_token,
      })}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (ll?.access_token) token.access_token = ll.access_token;
  }

  const { data: existing } = await admin
    .from("integrations")
    .select("meta")
    .eq("client_id", clientId)
    .eq("provider", provider)
    .maybeSingle();

  const { error: upsertError } = await admin.from("integrations").upsert(
    {
      client_id: clientId,
      provider,
      status: "connected",
      account_label: `${provider} (live)`,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      // Who authorised this token decides who may point it at other accounts.
      meta: { ...(existing?.meta ?? {}), tokenOwner: user.role === "client" ? "client" : "staff" },
    },
    { onConflict: "client_id,provider" },
  );
  if (upsertError) return done("error=save_failed");

  return done(`connected=${provider}`);
}
