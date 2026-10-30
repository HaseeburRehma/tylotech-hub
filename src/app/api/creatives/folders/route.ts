import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { bad, getFolder, UUID_RE } from "@/lib/creatives-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "");

async function staffAdmin() {
  const user = await getAuthUser();
  if (!user) return { error: bad("Unauthorized.", 401), user: null, admin: null } as const;
  if (!isStaff(user)) return { error: bad("Forbidden.", 403), user: null, admin: null } as const;
  const admin = createAdminClient();
  if (!admin) return { error: bad("Backend not configured.", 503), user: null, admin: null } as const;
  return { error: null, user, admin } as const;
}

const taken = (msg?: string) => /duplicate|unique/i.test(msg ?? "");

/** New category in a project's Creatives folder (team only). Body: { projectId, name }. */
export async function POST(req: Request) {
  const ctx = await staffAdmin();
  if (ctx.error) return ctx.error;
  const { user, admin } = ctx;
  const b = (await req.json().catch(() => null)) as { projectId?: unknown; name?: unknown } | null;
  const name = cleanName(b?.name);
  if (!name) return bad("Name required.");
  if (typeof b?.projectId !== "string" || !UUID_RE.test(b.projectId)) return bad("Project not found.", 404);
  const { data: project } = await admin.from("projects").select("id,client_id").eq("id", b.projectId).maybeSingle();
  if (!project) return bad("Project not found.", 404);
  const { data: last } = await admin.from("creative_folders").select("position").eq("project_id", project.id).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin
    .from("creative_folders")
    .insert({ client_id: project.client_id, project_id: project.id, name, position: (last?.position ?? -1) + 1, created_by: user.id })
    .select("id,client_id,project_id,name,position")
    .single();
  if (error) return bad(taken(error.message) ? "A category with this name exists." : "Could not add the category.", taken(error.message) ? 409 : 400);
  await logAudit(user, { action: "creative_folder.create", clientId: project.client_id, targetType: "creative_folder", targetId: data.id, summary: name }, admin);
  return NextResponse.json({ ok: true, folder: data });
}

/** Rename or reorder a category (team only). Body: { id, name?, position? }. */
export async function PATCH(req: Request) {
  const ctx = await staffAdmin();
  if (ctx.error) return ctx.error;
  const { admin } = ctx;
  const b = (await req.json().catch(() => null)) as { id?: unknown; name?: unknown; position?: unknown } | null;
  const folder = await getFolder(admin, b?.id);
  if (!folder) return bad("Category not found.", 404);
  const patch: Record<string, unknown> = {};
  if (b?.name !== undefined) {
    const name = cleanName(b.name);
    if (!name) return bad("Name required.");
    patch.name = name;
  }
  if (b?.position !== undefined) {
    if (!Number.isInteger(b.position) || (b.position as number) < 0 || (b.position as number) > 1000) return bad("Invalid position.");
    patch.position = b.position;
  }
  if (!Object.keys(patch).length) return bad("Nothing to change.");
  const { error } = await admin.from("creative_folders").update(patch).eq("id", folder.id);
  if (error) return bad(taken(error.message) ? "A category with this name exists." : "Could not save.", taken(error.message) ? 409 : 400);
  return NextResponse.json({ ok: true });
}

/** Remove an empty category (team only). Files and connected folders must go first. Body: { id }. */
export async function DELETE(req: Request) {
  const ctx = await staffAdmin();
  if (ctx.error) return ctx.error;
  const { user, admin } = ctx;
  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const folder = await getFolder(admin, b?.id);
  if (!folder) return bad("Category not found.", 404);
  const [files, sources] = await Promise.all([
    admin.from("creatives").select("id").eq("folder_id", folder.id).limit(1),
    admin.from("creative_sources").select("id").eq("folder_id", folder.id).limit(1),
  ]);
  if (files.data?.length || sources.data?.length) return bad("Only empty categories can be removed. Move or delete its files and disconnect its folders first.", 409);
  const { error } = await admin.from("creative_folders").delete().eq("id", folder.id);
  if (error) return bad("Could not remove the category.");
  await logAudit(user, { action: "creative_folder.delete", clientId: folder.client_id, targetType: "creative_folder", targetId: folder.id, summary: folder.name }, admin);
  return NextResponse.json({ ok: true });
}
