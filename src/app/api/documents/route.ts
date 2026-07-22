import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const TYPES = ["report", "contract", "invoice", "asset"];

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const sb = createClient();
  if (!admin || !sb) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const clientId = user.role === "client" ? user.client_id : (form?.get("clientId") as string | null);
  const type = (form?.get("type") as string) || "report";

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "Missing client." }, { status: 400 });
  if (user.role === "client" && clientId !== user.client_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 15 MB)." }, { status: 413 });

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${clientId}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from("documents").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data, error } = await sb
    .from("documents")
    .insert({
      client_id: clientId,
      name: file.name,
      file_url: path,
      type: TYPES.includes(type) ? type : "report",
      size: humanSize(file.size),
    })
    .select()
    .single();

  if (error) {
    await admin.storage.from("documents").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, document: data });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // RLS ensures the user may only see (and thus delete) permitted documents.
  const { data: doc } = await sb.from("documents").select("id,file_url").eq("id", id).single();
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (doc.file_url && !doc.file_url.startsWith("#") && !doc.file_url.startsWith("http")) {
    await admin.storage.from("documents").remove([doc.file_url]);
  }
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
