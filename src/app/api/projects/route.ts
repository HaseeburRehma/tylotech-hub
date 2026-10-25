import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/app/api/workflows/_shared";

export const runtime = "nodejs";

async function guard() {
  const user = await getAuthUser();
  if (!isStaff(user)) return null;
  const sb = createClient();
  return sb ? { sb, user } : null;
}

type Sb = NonNullable<ReturnType<typeof createClient>>;
type DbError = { code?: string; message?: string };

const STATUSES = new Set(["planning", "in_progress", "review", "done", "blocked"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ASSIGNEES = 10;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Columns added by later migrations (description: 0025, assignee_ids: 0045).
// On an older schema the write is retried without them.
const OPTIONAL_COLS = ["assignee_ids", "description"];
const missingCol = (err: DbError, col: string) =>
  (err.code === "42703" || err.code === "PGRST204") && (err.message ?? "").includes(col);

async function writeTolerant(row: Record<string, unknown>, run: (r: Record<string, unknown>) => PromiseLike<{ data: any; error: DbError | null }>) {
  let res = await run(row);
  for (let i = 0; i < OPTIONAL_COLS.length && res.error; i++) {
    const col = OPTIONAL_COLS.find((c) => c in row && missingCol(res.error!, c));
    if (!col) break;
    row = { ...row };
    delete row[col];
    res = await run(row);
  }
  return res;
}

/** Validates staff ids and derives the stored names server-side (never trust client-sent names). */
async function resolveAssignees(sb: Sb, raw: unknown): Promise<{ ids: string[]; names: string } | { error: string }> {
  if (raw == null) return { ids: [], names: "" };
  if (!Array.isArray(raw) || raw.length > MAX_ASSIGNEES || raw.some((x) => typeof x !== "string" || !UUID_RE.test(x))) {
    return { error: "Invalid assignees." };
  }
  const ids = Array.from(new Set(raw as string[]));
  if (!ids.length) return { ids, names: "" };
  const { data, error } = await sb.from("users").select("id,name,role").in("id", ids);
  if (error) return { error: "Could not check assignees." };
  const byId = new Map(
    (data ?? []).filter((u: any) => u.role === "admin" || u.role === "team").map((u: any) => [u.id as string, u.name as string]),
  );
  if (ids.some((id) => !byId.has(id))) return { error: "Assignees must be team members." };
  return { ids, names: ids.map((id) => byId.get(id)).join(", ") };
}

const assigneeColumns = (a: { ids: string[]; names: string }) => ({
  assignee_ids: a.ids,
  assigned_to_id: a.ids[0] ?? null,
  assigned_to: a.names || null,
});

export async function POST(req: Request) {
  const ctx = await guard();
  if (!ctx) return bad("Forbidden or backend not configured.", 403);
  const { sb, user } = ctx;

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (typeof b.clientId !== "string" || !UUID_RE.test(b.clientId) || !name) return bad("Client and project name are required.");
  if (name.length > 160) return bad("Project name must be 1–160 characters.");
  if (b.due && !DATE_RE.test(String(b.due))) return bad("Due date must be YYYY-MM-DD.");

  const assignees = await resolveAssignees(sb, b.assigneeIds);
  if ("error" in assignees) return bad(assignees.error);

  const description = typeof b.description === "string" ? b.description.trim().slice(0, 1000) : "";
  const row: Record<string, unknown> = {
    client_id: b.clientId,
    name,
    status: STATUSES.has(b.status) ? b.status : "planning",
    progress: Math.min(100, Math.max(0, Math.round(Number(b.progress) || 0))),
    due: b.due || null,
    ...assigneeColumns(assignees),
    ...(description ? { description } : {}),
  };
  const { data, error } = await writeTolerant(row, (r) => sb.from("projects").insert(r).select().single());

  if (error) {
    console.error("project create failed:", error.message);
    return bad("Could not create the project.");
  }
  await logAudit(user, { action: "project.create", clientId: data.client_id, targetType: "project", targetId: data.id, summary: data.name });
  return NextResponse.json({ ok: true, project: data });
}

export async function PATCH(req: Request) {
  const ctx = await guard();
  if (!ctx) return bad("Forbidden or backend not configured.", 403);
  const { sb, user } = ctx;

  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  if (typeof b.id !== "string" || !UUID_RE.test(b.id)) return bad("Project id required.");

  const patch: Record<string, any> = {};
  if (b.name !== undefined) {
    const name = String(b.name ?? "").trim();
    if (!name || name.length > 160) return bad("Project name must be 1–160 characters.");
    patch.name = name;
  }
  if (b.status !== undefined) {
    if (!STATUSES.has(b.status)) return bad("Unknown status.");
    patch.status = b.status;
  }
  if (b.progress !== undefined) {
    const progress = Number(b.progress);
    if (!Number.isFinite(progress)) return bad("Progress must be a number.");
    patch.progress = Math.min(100, Math.max(0, Math.round(progress)));
  }
  if (b.due !== undefined) {
    if (b.due && !DATE_RE.test(String(b.due))) return bad("Due date must be YYYY-MM-DD.");
    patch.due = b.due || null;
  }
  if (b.assigneeIds !== undefined) {
    const assignees = await resolveAssignees(sb, b.assigneeIds);
    if ("error" in assignees) return bad(assignees.error);
    Object.assign(patch, assigneeColumns(assignees));
  }
  if (b.description !== undefined) {
    patch.description = typeof b.description === "string" ? b.description.trim().slice(0, 1000) || null : null;
  }
  if (Object.keys(patch).length === 0) return bad("Nothing to update.");

  const { data, error } = await writeTolerant(patch, (r) => sb.from("projects").update(r).eq("id", b.id).select().single());
  if (error) {
    console.error("project update failed:", error.message);
    return bad("Could not update the project.");
  }
  await logAudit(user, {
    action: patch.status ? "project.status" : "project.update",
    clientId: data.client_id,
    targetType: "project",
    targetId: data.id,
    summary: `${data.name}: ${Object.keys(patch)
      .filter((k) => k !== "assigned_to_id" && k !== "assignee_ids")
      .map((k) => (k === "status" || k === "progress" ? `${k}=${patch[k]}` : k))
      .join(", ")}`,
  });
  return NextResponse.json({ ok: true, project: data });
}

export async function DELETE(req: Request) {
  const ctx = await guard();
  if (!ctx) return bad("Forbidden or backend not configured.", 403);
  const { sb, user } = ctx;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return bad("Project id required.");
  const { data: gone, error } = await sb.from("projects").delete().eq("id", id).select("client_id,name");
  if (error) {
    console.error("project delete failed:", error.message);
    return bad("Could not delete the project.");
  }
  if (gone?.length) await logAudit(user, { action: "project.delete", clientId: gone[0].client_id, targetType: "project", targetId: id, summary: gone[0].name });
  return NextResponse.json({ ok: true });
}
