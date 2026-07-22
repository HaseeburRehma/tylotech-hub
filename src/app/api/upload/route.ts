import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2 MB)." }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed." }, { status: 415 });
  }

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `client-${Date.now()}-${Math.floor(file.size % 100000)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error } = await admin.storage.from("logos").upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data } = admin.storage.from("logos").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
