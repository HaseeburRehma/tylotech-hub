import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { isCreativeProvider } from "@/lib/creative-sources";
import { completeCreativeConnect, creativesBackUrl, getFolder } from "@/lib/creatives-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Dropbox and OneDrive return here after "Connect folder" (Google uses the integrations callback). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getAuthUser();
  if (!user) return NextResponse.redirect(`${url.origin}/login`);
  const admin = createAdminClient();
  let st: { provider?: string; p?: string; folderId?: string; link?: string; nonce?: string } = {};
  try {
    st = JSON.parse(Buffer.from(url.searchParams.get("state") ?? "", "base64url").toString());
  } catch {
    /* checked below */
  }
  const folder = admin && isStaff(user) ? await getFolder(admin, st.folderId) : null;
  const back = async (q: string) => NextResponse.redirect(await creativesBackUrl(admin, url.origin, folder, q));

  const jar = cookies();
  const expected = jar.get("oauth_nonce")?.value;
  jar.delete("oauth_nonce");
  if (url.searchParams.get("error")) return back("source=denied");
  const code = url.searchParams.get("code");
  if (!code || st.provider !== "creative_source" || !st.nonce || st.nonce !== expected) return back("source=failed");
  if (!isStaff(user)) return back("source=forbidden");
  if (!admin || !folder || !isCreativeProvider(st.p) || st.p === "google_drive" || typeof st.link !== "string") return back("source=failed");
  const result = await completeCreativeConnect(admin, { provider: st.p, folder, link: st.link, code, origin: url.origin, userId: user.id });
  return back(`source=${result}`);
}
