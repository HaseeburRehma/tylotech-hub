import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { oauthConfig } from "@/lib/integrations/oauth";

export const runtime = "nodejs";

const NONCE_COOKIE = "oauth_nonce";

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

  // Bind `state` to a server-issued nonce stored in an httpOnly cookie so the
  // callback can reject a forged state (e.g. an attacker's own OAuth `code`
  // paired with a hand-crafted state naming someone else's clientId) even
  // when it's opened under a real, authenticated staff session — state alone
  // is otherwise just base64 JSON, fully attacker-constructible.
  const nonce = randomBytes(16).toString("hex");
  cookies().set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations",
  });

  const redirectUri = `${origin}/api/integrations/oauth/callback`;
  const state = Buffer.from(
    JSON.stringify({ provider: params.provider, clientId, nonce }),
  ).toString("base64url");

  const authUrl = new URL(cfg.authUrl);
  authUrl.searchParams.set("client_id", cfg.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", cfg.scope);
  authUrl.searchParams.set("state", state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) authUrl.searchParams.set(k, v);

  return NextResponse.redirect(authUrl.toString());
}
