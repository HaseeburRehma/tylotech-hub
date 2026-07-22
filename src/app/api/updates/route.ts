import { NextResponse } from "next/server";
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

  const { data, error } = await sb
    .from("updates")
    .insert({
      client_id: b.clientId,
      title: b.title.trim(),
      description: b.description?.trim() || null,
      type: TYPES.includes(b.type) ? b.type : "note",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await notifyClientUsers(b.clientId, {
    title: "New update from TyloTech",
    body: b.title.trim(),
    href: "/chat",
    type: "update",
  });

  return NextResponse.json({ ok: true, update: data });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const sb = createClient();
  if (!sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const { error } = await sb.from("updates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
