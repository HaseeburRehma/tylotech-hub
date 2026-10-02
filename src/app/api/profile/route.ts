import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { name?: string; title?: string | null; notifyEmail?: boolean; phone?: string };
  const row: Record<string, string | null> = {};
  const meta: Record<string, unknown> = {};

  if (b.name !== undefined) {
    const name = b.name.trim();
    if (!name || name.length > 120) return NextResponse.json({ error: "Name must be 1–120 characters." }, { status: 400 });
    row.name = name;
    meta.name = name;
  }
  if (b.title !== undefined) {
    const title = (b.title ?? "").trim();
    if (title.length > 80) return NextResponse.json({ error: "Title is too long." }, { status: 400 });
    row.title = title || null;
  }
  if (b.phone !== undefined) {
    const phone = String(b.phone).trim();
    if (phone && !/^[+\d][\d\s()/-]{3,39}$/.test(phone)) {
      return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
    }
    meta.phone = phone || null;
  }
  if (b.notifyEmail !== undefined) {
    if (typeof b.notifyEmail !== "boolean") return NextResponse.json({ error: "Invalid preference." }, { status: 400 });
    meta.notify_email = b.notifyEmail;
  }
  if (!Object.keys(row).length && !Object.keys(meta).length) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  if (Object.keys(row).length) {
    const { error } = await admin.from("users").update(row).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (Object.keys(meta).length) {
    const { data } = await admin.auth.admin.getUserById(user.id);
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...(data.user?.user_metadata ?? {}), ...meta } });
  }

  return NextResponse.json({ ok: true });
}
