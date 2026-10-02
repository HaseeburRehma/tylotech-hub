import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
// Raster only — SVG can carry script and the bucket is public.
const ALLOWED: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: "Only JPG, PNG or WebP images are allowed." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 2 MB)." }, { status: 413 });

  const path = `avatars/${user.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("logos")
    .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const url = admin.storage.from("logos").getPublicUrl(path).data.publicUrl;
  const { error } = await admin.from("users").update({ avatar_url: url }).eq("id", user.id);
  if (error) {
    await admin.storage.from("logos").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Drop the previous upload so replaced avatars don't accumulate.
  const prev = user.avatarUrl?.split("/logos/")[1];
  if (prev?.startsWith(`avatars/${user.id}-`)) await admin.storage.from("logos").remove([prev]);

  return NextResponse.json({ ok: true, url });
}

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  await admin.from("users").update({ avatar_url: null }).eq("id", user.id);
  const prev = user.avatarUrl?.split("/logos/")[1];
  if (prev?.startsWith(`avatars/${user.id}-`)) await admin.storage.from("logos").remove([prev]);
  return NextResponse.json({ ok: true });
}
