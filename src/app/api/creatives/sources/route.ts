import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { creativeAuthUrl, isCreativeProvider, parseFolderLink } from "@/lib/creative-sources";
import { creativesBackUrl, getFolder } from "@/lib/creatives-server";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Start "Connect folder" (team only): ?folderId=&provider=google_drive|dropbox|onedrive&link=.
 * Read-only sign-in with the provider; the callback checks the folder and reads it.
 * Google returns through the integrations callback (its registered redirect URI).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  // Partners never get here from the page; don't tell them anything about the folder they named.
  if (!isStaff(user)) return NextResponse.redirect(`${url.origin}/creatives?source=forbidden`);
  const admin = createAdminClient();
  const folder = admin ? await getFolder(admin, url.searchParams.get("folderId")) : null;
  const back = async (q: string) => NextResponse.redirect(await creativesBackUrl(admin, url.origin, folder, q));
  if (!folder) return back("source=failed");
  const provider = url.searchParams.get("provider");
  if (!isCreativeProvider(provider)) return back("source=failed");
  const link = parseFolderLink(provider, url.searchParams.get("link") ?? "");
  if (!link) return back("source=bad_link");
  const rl = await getRateLimiter().limit(`creative-connect:${user.id}`, { limit: 20, windowSec: 3600 });
  if (!rl.success) return back("source=rate");

  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ provider: "creative_source", p: provider, clientId: folder.client_id, folderId: folder.id, link, nonce })).toString("base64url");
  const auth = creativeAuthUrl(provider, url.origin, state);
  if (!auth) return back("source=not_configured");
  cookies().set("oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: provider === "google_drive" ? "/api/integrations" : "/api/creatives",
  });
  return NextResponse.redirect(auth);
}
