import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { UUID_RE } from "@/lib/leads";
import { logoTone } from "@/lib/logo-tone-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * The signed-in client's branding for apps that can't inspect the logo
 * themselves (mobile): logo URL + whether it needs a dark tile. The team
 * passes ?clientId= for the partner they are viewing (ignored for clients).
 */
export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let company = user.company ?? null;
  let logoUrl = user.logoUrl ?? null;
  const asked = new URL(req.url).searchParams.get("clientId");
  if (isStaff(user) && asked) {
    const admin = createAdminClient();
    if (!UUID_RE.test(asked) || !admin) return NextResponse.json({ error: "Unknown partner." }, { status: 400 });
    const { data } = await admin.from("clients").select("company,logo_url").eq("id", asked).maybeSingle();
    if (!data) return NextResponse.json({ error: "Unknown partner." }, { status: 404 });
    company = data.company ?? null;
    logoUrl = data.logo_url ?? null;
  }
  return NextResponse.json(
    { company, logoUrl, logoTone: await logoTone(logoUrl) },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
