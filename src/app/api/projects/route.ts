import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function guard() {
  const user = await getAuthUser();
  if (!isStaff(user)) return null;
  const sb = createClient();
  return sb ? sb : null;
}

export async function POST(req: Request) {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "Forbidden or backend not configured." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.clientId || !b.name?.trim()) {
    return NextResponse.json({ error: "Client and project name are required." }, { status: 400 });
  }

  const { data, error } = await sb
    .from("projects")
    .insert({
      client_id: b.clientId,
      name: b.name.trim(),
      status: b.status || "planning",
      progress: Number(b.progress) || 0,
      assigned_to: b.assignedToName || null,
      assigned_to_id: b.assignedToId || null,
      due: b.due || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: data });
}

export async function PATCH(req: Request) {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "Forbidden or backend not configured." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.id) return NextResponse.json({ error: "Project id required." }, { status: 400 });

  const patch: Record<string, any> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.status !== undefined) patch.status = b.status;
  if (b.progress !== undefined) patch.progress = Number(b.progress);
  if (b.due !== undefined) patch.due = b.due || null;
  if (b.assignedToId !== undefined) {
    patch.assigned_to_id = b.assignedToId || null;
    patch.assigned_to = b.assignedToName || null;
  }

  const { data, error } = await sb.from("projects").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, project: data });
}

export async function DELETE(req: Request) {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "Forbidden or backend not configured." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Project id required." }, { status: 400 });
  const { error } = await sb.from("projects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
