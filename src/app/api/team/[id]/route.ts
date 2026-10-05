import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin: change a staff member's role/title, or deactivate/reactivate the account. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Only admins can manage the team." }, { status: 403 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { role?: string; title?: string | null; active?: boolean };
  const self = params.id === user.id;

  const { data: target } = await admin.from("users").select("id,role").eq("id", params.id).maybeSingle();
  if (!target || !["admin", "team"].includes(target.role)) {
    return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  }

  const row: Record<string, unknown> = {};
  if (b.role !== undefined) {
    if (!["admin", "team"].includes(b.role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    if (self && b.role !== "admin") return NextResponse.json({ error: "You can't remove your own admin role." }, { status: 400 });
    row.role = b.role;
  }
  if (b.title !== undefined) {
    const title = String(b.title ?? "").trim();
    if (title.length > 80) return NextResponse.json({ error: "Title is too long." }, { status: 400 });
    row.title = title || null;
  }
  if (b.active !== undefined) {
    if (self) return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
    // Block sign-in at the auth level, and flag the profile so lists hide them.
    const { error: banErr } = await admin.auth.admin.updateUserById(params.id, { ban_duration: b.active ? "none" : "876000h" });
    if (banErr) return NextResponse.json({ error: banErr.message }, { status: 400 });
    row.deactivated_at = b.active ? null : new Date().toISOString();
  }
  if (!Object.keys(row).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  let { error } = await admin.from("users").update(row).eq("id", params.id);
  // Pre-0030: no deactivated_at column — the auth-level ban above still applies.
  if (error && "deactivated_at" in row && /deactivated_at/.test(error.message)) {
    const { deactivated_at: _d, ...rest } = row;
    error = Object.keys(rest).length ? (await admin.from("users").update(rest).eq("id", params.id)).error : null;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (row.role) {
    const { data } = await admin.auth.admin.getUserById(params.id);
    await admin.auth.admin.updateUserById(params.id, { user_metadata: { ...(data.user?.user_metadata ?? {}), role: row.role } });
  }
  return NextResponse.json({ ok: true });
}
