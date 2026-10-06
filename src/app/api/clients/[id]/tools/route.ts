import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Staff switch one AI tool on/off for one client: { slug, enabled }. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!isStaff(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Backend not configured." }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { slug?: unknown; enabled?: unknown } | null;
  if (!b || typeof b.slug !== "string" || typeof b.enabled !== "boolean") {
    return NextResponse.json({ error: "slug and enabled are required." }, { status: 400 });
  }

  const [{ data: tool }, { data: client }] = await Promise.all([
    admin.from("ai_tools").select("id,name").eq("slug", b.slug).maybeSingle(),
    admin.from("clients").select("id,company").eq("id", params.id).maybeSingle(),
  ]);
  if (!tool) return NextResponse.json({ error: "Unknown tool." }, { status: 404 });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const { error } = await admin
    .from("client_tools")
    .upsert({ client_id: params.id, tool_id: tool.id, is_unlocked: b.enabled }, { onConflict: "client_id,tool_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit(user, {
    action: b.enabled ? "tool.enable" : "tool.disable",
    clientId: params.id,
    targetType: "ai_tool",
    targetId: b.slug,
    summary: `${tool.name} ${b.enabled ? "enabled" : "disabled"} for ${client.company}`,
  }, admin);
  return NextResponse.json({ ok: true });
}
