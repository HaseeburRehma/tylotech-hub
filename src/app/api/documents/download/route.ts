import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // RLS ensures the requester can only read their own client's documents.
  const { data: doc } = await sb.from("documents").select("file_url").eq("id", id).single();
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const path = doc.file_url as string;
  if (!path || path.startsWith("#")) {
    return NextResponse.json({ error: "No file attached." }, { status: 404 });
  }
  if (path.startsWith("http")) return NextResponse.redirect(path);

  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 60);
  if (error || !data) return NextResponse.json({ error: "Could not generate link." }, { status: 400 });
  return NextResponse.redirect(data.signedUrl);
}
