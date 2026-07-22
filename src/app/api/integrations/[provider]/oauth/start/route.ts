import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { oauthConfig } from "@/lib/integrations/oauth";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const user = await getAuthUser();
  const origin = new URL(req.url).origin;
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const cfg = oauthConfig(params.provider);
  if (!cfg) {
    // No app credentials configured → stay on sandbox mode.
    return NextResponse.redirect(`${origin}/integrations?error=not_configured`);
  }

  const clientId =
    user.role === "client" ? user.client_id : new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.redirect(`${origin}/integrations?error=missing_client`);

  const redirectUri = `${origin}/api/integrations/oauth/callback`;
  const state = Buffer.from(JSON.stringify({ provider: params.provider, clientId })).toString(
    "base64url",
  );

  const authUrl = new URL(cfg.authUrl);
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", cfg.scope);
  authUrl.searchParams.set("state", state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) authUrl.searchParams.set(k, v);

  return NextResponse.redirect(authUrl.toString());
}
