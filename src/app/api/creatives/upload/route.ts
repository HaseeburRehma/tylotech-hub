import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff } from "@/lib/auth";
import { fileType, MAX_BATCH, MAX_FILE_BYTES, safeFileName, storagePrefix } from "@/lib/creatives";
import { bad, getFolder } from "@/lib/creatives-server";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Step 1 of an upload (team only): one signed upload link per file. The browser
 * sends the bytes straight to storage (no size cap from our server, zips are
 * unpacked in the browser), then confirms with POST /api/creatives.
 * Body: { folderId, files: [{ name, size }] }.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!isStaff(user)) return bad("Only the TyloTech team can upload creatives.", 403);
  const b = (await req.json().catch(() => null)) as { folderId?: unknown; files?: unknown } | null;
  const files = Array.isArray(b?.files) ? (b!.files as { name?: unknown; size?: unknown }[]) : null;
  if (!files?.length) return bad("No files.");
  if (files.length > MAX_BATCH) return bad(`At most ${MAX_BATCH} files at once.`);
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);
  const folder = await getFolder(admin, b?.folderId);
  if (!folder) return bad("Category not found.", 404);
  const rl = await getRateLimiter().limit(`creative-upload:${user.id}`, { limit: 60, windowSec: 60 });
  if (!rl.success) return bad("Too many uploads at once. Wait a minute.", 429);

  const prefix = storagePrefix(folder.client_id, folder.project_id, folder.id);
  const out: { name: string; path?: string; token?: string; contentType?: string; error?: string }[] = [];
  for (const f of files) {
    const name = typeof f?.name === "string" ? f.name : "";
    const size = Number(f?.size);
    const type = fileType(name);
    if (!type) {
      out.push({ name, error: "type" });
      continue;
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
      out.push({ name, error: "size" });
      continue;
    }
    const path = `${prefix}${randomUUID()}-${safeFileName(name)}`;
    const { data, error } = await admin.storage.from("creatives").createSignedUploadUrl(path);
    if (error || !data) out.push({ name, error: "storage" });
    else out.push({ name, path, token: data.token, contentType: type.mime });
  }
  return NextResponse.json({ ok: true, files: out });
}
