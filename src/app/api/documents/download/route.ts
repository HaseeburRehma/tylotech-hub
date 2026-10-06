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

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  // The mobile app asks for the short-lived link as JSON and opens it itself.
  const asJson = params.get("json") === "1";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // RLS ensures the requester can only read their own client's documents.
  const { data: doc } = await sb.from("documents").select("client_id,file_url").eq("id", id).single();
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const path = doc.file_url as string;
  if (!path || path.startsWith("#")) {
    return NextResponse.json({ error: "No file attached." }, { status: 404 });
  }
  // Safe only because `documents` writes are staff-only at the DB level
  // (see supabase/migrations/0024_security_hardening_3.sql) — a client-role
  // user can no longer set an arbitrary file_url on their own document row
  // and turn this into an open redirect off a trusted domain. Apply that
  // migration before relying on this branch.
  if (path.startsWith("http")) return asJson ? NextResponse.json({ url: path }) : NextResponse.redirect(path);

  // Defense-in-depth: a client can control file_url on rows in their own tenant,
  // so never sign a storage path that doesn't live under this document's own
  // client folder — otherwise a crafted row could point at another tenant's file.
  if (!path.startsWith(`${doc.client_id}/`)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 60);
  if (error || !data) return NextResponse.json({ error: "Could not generate link." }, { status: 400 });
  return asJson ? NextResponse.json({ url: data.signedUrl }) : NextResponse.redirect(data.signedUrl);
}
