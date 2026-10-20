import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { WF_BUCKET } from "@/lib/workflow-files";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Open a file of an approval request. Clients only reach files that the team
 * attached to *their* approval (step attachments are otherwise staff-only).
 * ?json=1 → { url }, ?download=1 → attachment download.
 */
export async function GET(req: Request, { params }: { params: { id: string; attId: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.attId)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const { data: a } = await admin.from("workflow_approvals").select("client_id,attachment_ids,status").eq("id", params.id).maybeSingle();
  if (!a || !(a.attachment_ids as string[]).includes(params.attId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isStaff(user) && (user.client_id !== a.client_id || a.status === "cancelled")) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: att } = await admin.from("workflow_step_attachments").select("kind,name,path,url,mime").eq("id", params.attId).maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  let url: string;
  if (att.kind === "link") url = att.url!;
  else {
    const { data, error } = await admin.storage.from(WF_BUCKET).createSignedUrl(att.path!, 120, q.get("download") === "1" ? { download: att.name } : undefined);
    if (error || !data) return NextResponse.json({ error: "Could not generate link." }, { status: 400 });
    url = data.signedUrl;
  }
  return q.get("json") === "1" ? NextResponse.json({ url, name: att.name, mime: att.mime, kind: att.kind }) : NextResponse.redirect(url);
}
