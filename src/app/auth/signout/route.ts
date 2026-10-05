import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { LOGIN_BRAND_COOKIE, loginPathFor } from "@/lib/login-brand";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  if (supabase) await supabase.auth.signOut();
  const target = loginPathFor(cookies().get(LOGIN_BRAND_COOKIE)?.value);
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
