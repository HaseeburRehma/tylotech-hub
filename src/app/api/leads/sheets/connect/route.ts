import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { UUID_RE } from "@/lib/leads";
import { SHEETS_SCOPE } from "@/lib/leads-sheets";
import { spreadsheetIdFrom } from "@/lib/sheet-leads-parse";

export const runtime = "nodejs";

/**
 * Start "Connect Google Sheet" for a partner (team: ?clientId=, sheet: ?url=).
 * Read-only Google grant through the integrations callback (its redirect URI is
 * registered with Google), bound to this browser by the same nonce cookie.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${url.origin}/leads?${q}`);
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  const googleId = process.env.GOOGLE_CLIENT_ID;
  if (!googleId || !process.env.GOOGLE_CLIENT_SECRET) return back("sheet=not_configured");
  const clientId = isStaff(user) ? url.searchParams.get("clientId") : user.client_id;
  if (!clientId || !UUID_RE.test(clientId)) return back("sheet=failed");
  const sheet = spreadsheetIdFrom(url.searchParams.get("url") ?? "");
  if (!sheet) return back("sheet=bad_url");

  const nonce = randomBytes(16).toString("hex");
  cookies().set("oauth_nonce", nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/integrations" });
  const state = Buffer.from(JSON.stringify({ provider: "google_sheet", clientId, nonce, sheet })).toString("base64url");
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", googleId);
  auth.searchParams.set("redirect_uri", `${url.origin}/api/integrations/oauth/callback`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", SHEETS_SCOPE);
  // Offline + consent: a refresh token every time, so the minute poll keeps reading.
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("state", state);
  return NextResponse.redirect(auth.toString());
}
