import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getAuthUser, isStaff } from "@/lib/auth";
import { displayName, fileType, MAX_BATCH, parseStoragePath } from "@/lib/creatives";
import { bad, getFolder, UUID_RE } from "@/lib/creatives-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= max ? (v as number) : null);

/**
 * Step 2 of an upload (team only): register files that reached storage.
 * Each path must be one we issued for that category and the object must exist;
 * size and type are read from storage, not from the request.
 * Body: { items: [{ path, name, hash?, width?, height?, durationSec?, createdAt? }] }.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!isStaff(user)) return bad("Only the TyloTech team can upload creatives.", 403);
  const b = (await req.json().catch(() => null)) as { items?: unknown } | null;
  const items = Array.isArray(b?.items) ? (b!.items as Record<string, unknown>[]) : null;
  if (!items?.length) return bad("Nothing to save.");
  if (items.length > MAX_BATCH) return bad(`At most ${MAX_BATCH} files at once.`);
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);

  const folders = new Map<string, Awaited<ReturnType<typeof getFolder>>>();
  const rows: Record<string, unknown>[] = [];
  const failed: string[] = [];
  for (const it of items) {
    const path = typeof it.path === "string" ? it.path : "";
    const p = parseStoragePath(path);
    const name = displayName(typeof it.name === "string" ? it.name : p?.fileName ?? "");
    const type = fileType(p?.fileName ?? "");
    if (!p || !type) {
      failed.push(name);
      continue;
    }
    if (!folders.has(p.folderId)) folders.set(p.folderId, await getFolder(admin, p.folderId));
    const folder = folders.get(p.folderId);
    if (!folder || folder.client_id !== p.clientId || folder.project_id !== p.projectId) {
      failed.push(name);
      continue;
    }
    const dir = path.slice(0, path.lastIndexOf("/"));
    const base = path.slice(path.lastIndexOf("/") + 1);
    const { data: listed } = await admin.storage.from("creatives").list(dir, { search: base, limit: 5 });
    const obj = (listed ?? []).find((o) => o.name === base);
    if (!obj) {
      failed.push(name);
      continue;
    }
    const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
    const created = typeof it.createdAt === "string" ? Date.parse(it.createdAt) : NaN;
    rows.push({
      client_id: folder.client_id,
      project_id: folder.project_id,
      folder_id: folder.id,
      source: "upload",
      name,
      kind: type.kind,
      mime: meta.mimetype ?? type.mime,
      size_bytes: Number(meta.size) || null,
      width: int(it.width, 100_000),
      height: int(it.height, 100_000),
      duration_sec: typeof it.durationSec === "number" && it.durationSec > 0 && it.durationSec < 86_400 ? Math.round(it.durationSec * 100) / 100 : null,
      storage_path: path,
      content_hash: typeof it.hash === "string" && HASH_RE.test(it.hash) ? it.hash : null,
      // The month it counts in: when the file was made, never in the future.
      ...(Number.isFinite(created) && created > Date.UTC(2000, 0, 1) ? { created_at: new Date(Math.min(created, Date.now())).toISOString() } : {}),
      uploaded_by: user.id,
    });
  }
  if (!rows.length) return bad("The upload could not be saved. Try again.", 400);
  const { data, error } = await admin.from("creatives").upsert(rows, { onConflict: "storage_path", ignoreDuplicates: true }).select("*");
  if (error) {
    console.error("creatives insert failed:", error.message);
    return bad("The upload could not be saved. Try again.", 500);
  }
  const first = rows[0] as { client_id: string };
  await logAudit(user, { action: "creative.upload", clientId: first.client_id, targetType: "creative", summary: `${rows.length} file(s)` }, admin);
  return NextResponse.json({ ok: true, creatives: data ?? [], failed });
}

async function pick(admin: NonNullable<ReturnType<typeof createAdminClient>>, ids: unknown) {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)).slice(0, 200) : [];
  if (!list.length) return [];
  const { data } = await admin.from("creatives").select("id,client_id,project_id,folder_id,source,storage_path,name").in("id", list);
  return (data ?? []) as { id: string; client_id: string; project_id: string; folder_id: string; source: string; storage_path: string | null; name: string }[];
}

/** Move uploads to another category of the same partner, or rename one (team only). Body: { ids, folderId } | { id, name }. */
export async function PATCH(req: Request) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!isStaff(user)) return bad("Forbidden.", 403);
  const b = (await req.json().catch(() => null)) as { ids?: unknown; folderId?: unknown; id?: unknown; name?: unknown } | null;
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);

  if (typeof b?.name === "string") {
    const [c] = await pick(admin, [b.id]);
    if (!c) return bad("Not found.", 404);
    if (!b.name.trim()) return bad("Name required.");
    const name = displayName(b.name);
    const { error } = await admin.from("creatives").update({ name }).eq("id", c.id);
    if (error) return bad("Could not rename.");
    return NextResponse.json({ ok: true });
  }

  const folder = await getFolder(admin, b?.folderId);
  if (!folder) return bad("Category not found.", 404);
  const found = await pick(admin, b?.ids);
  if (!found.length) return bad("Not found.", 404);
  if (found.some((c) => c.client_id !== folder.client_id)) return bad("Files can only move within the same partner.", 400);
  // Synced files follow their cloud folder; moving them here would be undone by the next sync.
  const movable = found.filter((c) => c.source === "upload").map((c) => c.id);
  if (!movable.length) return bad("Synced files move with their cloud folder.", 400);
  const { error } = await admin.from("creatives").update({ folder_id: folder.id, project_id: folder.project_id }).in("id", movable);
  if (error) return bad("Could not move the files.");
  await logAudit(user, { action: "creative.move", clientId: folder.client_id, targetType: "creative_folder", targetId: folder.id, summary: `${movable.length} file(s) to ${folder.name}` }, admin);
  return NextResponse.json({ ok: true, moved: movable.length, skipped: found.length - movable.length });
}

/** Delete uploaded files (team only). Synced files are removed in their cloud folder. Body: { ids }. */
export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!isStaff(user)) return bad("Forbidden.", 403);
  const b = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);
  const found = await pick(admin, b?.ids);
  const uploads = found.filter((c) => c.source === "upload");
  if (!uploads.length) return bad(found.length ? "Synced files are removed in their cloud folder." : "Not found.", found.length ? 400 : 404);
  const { error } = await admin.from("creatives").delete().in("id", uploads.map((c) => c.id));
  if (error) return bad("Could not delete.");
  const paths = uploads.map((c) => c.storage_path).filter((p): p is string => !!p && !!parseStoragePath(p));
  if (paths.length) await admin.storage.from("creatives").remove(paths);
  await logAudit(user, { action: "creative.delete", clientId: uploads[0].client_id, targetType: "creative", summary: uploads.slice(0, 5).map((c) => c.name).join(", ") }, admin);
  return NextResponse.json({ ok: true, deleted: uploads.length, skipped: found.length - uploads.length });
}
