import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Admin/staff creates a new TyloTech team member (no invite code needed). */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const title = body.title?.trim() || null;
  const role = body.role === "admin" ? "admin" : "team";

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email and password are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (error || !created.user) {
    return NextResponse.json({ error: error?.message ?? "Could not create the account." }, { status: 400 });
  }

  // Insert the profile. `title` is best-effort in case 0014 hasn't run yet.
  const base = { id: created.user.id, email, name, role, client_id: null } as Record<string, unknown>;
  let pErr = (await admin.from("users").insert({ ...base, title })).error;
  if (pErr) pErr = (await admin.from("users").insert(base)).error; // retry without title column
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
