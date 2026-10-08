import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyClientUsers } from "@/lib/notify";

export const runtime = "nodejs";

const TYPES = ["milestone", "report", "campaign", "note", "alert"];

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  if (!b.clientId || !b.title?.trim()) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }
  if (b.title.trim().length > 160) return NextResponse.json({ error: "Title must be at most 160 characters." }, { status: 400 });

  const { data, error } = await sb
    .from("updates")
    .insert({
      client_id: b.clientId,
      title: b.title.trim(),
      description: b.description?.trim().slice(0, 2000) || null,
      type: TYPES.includes(b.type) ? b.type : "note",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit(user, { action: "update.post", clientId: b.clientId, targetType: "update", targetId: data.id, summary: data.title });

  await notifyClientUsers(b.clientId, {
    title: "Neues Update von TyloTech",
    body: b.title.trim(),
    href: "/chat",
    type: "update",
  });

  return NextResponse.json({ ok: true, update: data });
}

/** Edit an update (typo fixes etc.) — no new notification is sent. */
export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (b.title !== undefined) {
    const title = String(b.title ?? "").trim();
    if (!title || title.length > 160) return NextResponse.json({ error: "Title must be 1–160 characters." }, { status: 400 });
    patch.title = title;
  }
  if (b.description !== undefined) patch.description = String(b.description ?? "").trim().slice(0, 2000) || null;
  if (b.type !== undefined) {
    if (!TYPES.includes(String(b.type))) return NextResponse.json({ error: "Unknown type." }, { status: 400 });
    patch.type = b.type;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await sb.from("updates").update(patch).eq("id", b.id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Update not found." }, { status: 404 });
  await logAudit(user, { action: "update.edit", clientId: data.client_id, targetType: "update", targetId: data.id, summary: data.title });
  return NextResponse.json({ ok: true, update: data });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const { data: gone, error } = await sb.from("updates").delete().eq("id", id).select("client_id,title");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (gone?.length) await logAudit(user, { action: "update.delete", clientId: gone[0].client_id, targetType: "update", targetId: id, summary: gone[0].title });
  return NextResponse.json({ ok: true });
}
