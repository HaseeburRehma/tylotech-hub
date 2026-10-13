import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { logoTone } from "@/lib/logo-tone-server";

export const runtime = "nodejs";

/**
 * The signed-in client's branding for apps that can't inspect the logo
 * themselves (mobile): logo URL + whether it needs a dark tile.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const logoUrl = user.logoUrl ?? null;
  return NextResponse.json(
    { company: user.company ?? null, logoUrl, logoTone: await logoTone(logoUrl) },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
