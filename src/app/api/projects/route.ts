import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function guard() {
  const user = await getAuthUser();
  if (!isStaff(user)) return null;
  const sb = createClient();
  return sb ? { sb, user } : null;
}

const STATUSES = new Set(["planning", "in_progress", "review", "done", "blocked"]);

const isMissingColumn = (err: { code?: string; message?: string }) =>
  err.code === "42703" || err.code === "PGRST204" || /description/i.test(err.message ?? "");

export async function POST(req: Request) {
  const ctx = await guard();
  if (!ctx) return NextResponse.json({ error: "Forbidden or backend not configured." }, { status: 403 });
  const { sb, user } = ctx;

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.clientId || !b.name?.trim()) {
    return NextResponse.json({ error: "Client and project name are required." }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    client_id: b.clientId,
    name: b.name.trim(),
    status: STATUSES.has(b.status) ? b.status : "planning",
    progress: Math.min(100, Math.max(0, Math.round(Number(b.progress) || 0))),
    assigned_to: b.assignedToName || null,
    assigned_to_id: b.assignedToId || null,
    due: b.due || null,
  };
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 1000) : "";
  let res = await sb.from("projects").insert(description ? { ...row, description } : row).select().single();
  // Pre-0025 schema has no description column — keep the project, drop the note.
  if (res.error && description && isMissingColumn(res.error)) {
    res = await sb.from("projects").insert(row).select().single();
  }
  const { data, error } = res;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit(user, { action: "project.create", clientId: data.client_id, targetType: "project", targetId: data.id, summary: data.name });
  return NextResponse.json({ ok: true, project: data });
}

export async function PATCH(req: Request) {
  const ctx = await guard();
  if (!ctx) return NextResponse.json({ error: "Forbidden or backend not configured." }, { status: 403 });
  const { sb, user } = ctx;

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (!b.id) return NextResponse.json({ error: "Project id required." }, { status: 400 });

  const patch: Record<string, any> = {};
  if (b.name !== undefined) {
    const name = String(b.name ?? "").trim();
    if (!name || name.length > 160) return NextResponse.json({ error: "Project name must be 1–160 characters." }, { status: 400 });
    patch.name = name;
  }
  if (b.status !== undefined) {
    if (!STATUSES.has(b.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    patch.status = b.status;
  }
  if (b.progress !== undefined) {
    const progress = Number(b.progress);
    if (!Number.isFinite(progress)) return NextResponse.json({ error: "Progress must be a number." }, { status: 400 });
    patch.progress = Math.min(100, Math.max(0, Math.round(progress)));
  }
  if (b.due !== undefined) {
    if (b.due && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.due))) return NextResponse.json({ error: "Due date must be YYYY-MM-DD." }, { status: 400 });
    patch.due = b.due || null;
  }
  if (b.assignedToId !== undefined) {
    patch.assigned_to_id = b.assignedToId || null;
    patch.assigned_to = b.assignedToName || null;
  }
  if (b.description !== undefined) {
    patch.description = typeof b.description === "string" ? b.description.trim().slice(0, 1000) || null : null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await sb.from("projects").update(patch).eq("id", b.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logAudit(user, {
    action: patch.status ? "project.status" : "project.update",
    clientId: data.client_id,
    targetType: "project",
    targetId: data.id,
    summary: `${data.name}: ${Object.keys(patch).filter((k) => k !== "assigned_to_id").map((k) => (k === "status" || k === "progress" ? `${k}=${patch[k]}` : k)).join(", ")}`,
  });
  return NextResponse.json({ ok: true, project: data });
}

export async function DELETE(req: Request) {
  const ctx = await guard();
  if (!ctx) return NextResponse.json({ error: "Forbidden or backend not configured." }, { status: 403 });
  const { sb, user } = ctx;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Project id required." }, { status: 400 });
  const { data: gone, error } = await sb.from("projects").delete().eq("id", id).select("client_id,name");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (gone?.length) await logAudit(user, { action: "project.delete", clientId: gone[0].client_id, targetType: "project", targetId: id, summary: gone[0].name });
  return NextResponse.json({ ok: true });
}
