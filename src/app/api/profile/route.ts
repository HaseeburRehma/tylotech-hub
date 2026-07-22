import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { name?: string };
  const name = b.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const { error } = await admin.from("users").update({ name }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { name } });

  return NextResponse.json({ ok: true });
}
