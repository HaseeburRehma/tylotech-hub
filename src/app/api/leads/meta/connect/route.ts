import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { META_GRAPH_VERSION } from "@/lib/integrations/fetchers";
import { META_LEADS_SCOPES, metaApp } from "@/lib/leads-meta";

export const runtime = "nodejs";

/**
 * Start "Connect Meta Lead Ads" for a partner (team: ?clientId=). Reuses the
 * integrations OAuth callback (already registered with Meta) with provider
 * "meta_leads" and the same nonce cookie that binds state to this browser.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/leads?${q}`);
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  const app = metaApp();
  if (!app) return back("meta=not_configured");
  const clientId = isStaff(user) ? url.searchParams.get("clientId") : user.client_id;
  if (!clientId) return back("meta=missing_client");

  const nonce = randomBytes(16).toString("hex");
  cookies().set("oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/integrations" });
  const state = Buffer.from(JSON.stringify({ provider: "meta_leads", clientId, nonce })).toString("base64url");
  const auth = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  auth.searchParams.set("client_id", app.id);
  auth.searchParams.set("redirect_uri", `${url.origin}/api/integrations/oauth/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", META_LEADS_SCOPES);
  auth.searchParams.set("state", state);
  return NextResponse.redirect(auth.toString());
}
