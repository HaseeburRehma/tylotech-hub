import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { cloudFileResponse, SourceError } from "@/lib/creative-sources";
import { parseStoragePath } from "@/lib/creatives";
import { bad, UUID_RE } from "@/lib/creatives-server";
import { getRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SAFE = /^(image\/(jpeg|png|webp|gif|avif|heic|heif)|video\/(mp4|quicktime|webm|x-m4v)|application\/pdf)$/;

const disposition = (kind: "inline" | "attachment", name: string) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/**
 * Preview or download one creative: ?thumb=1 for the grid, ?download=1 to save.
 * Who may see it is decided by RLS (the team, or the partner's own people).
 * Uploads get a short signed storage link; Dropbox and OneDrive a short direct
 * link; Google Drive files are streamed (with Range, so videos can seek).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return bad("Unauthorized.", 401);
  if (!UUID_RE.test(params.id)) return bad("Not found.", 404);
  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) return bad("Backend not configured.", 503);
  const rl = await getRateLimiter().limit(`creative-file:${user.id}`, { limit: 600, windowSec: 60 });
  if (!rl.success) return bad("Too many requests.", 429);

  const { data: c } = await sb.from("creatives").select("id,client_id,source,source_id,external_id,storage_path,name,mime,kind").eq("id", params.id).maybeSingle();
  if (!c) return bad("Not found.", 404);
  const url = new URL(req.url);
  const thumb = url.searchParams.get("thumb") === "1";
  const download = url.searchParams.get("download") === "1";

  if (c.source === "upload") {
    const p = parseStoragePath(c.storage_path ?? "");
    if (!p || p.clientId !== c.client_id) return bad("Not found.", 404);
    if (thumb && c.kind !== "image") return bad("No preview.", 404);
    const { data, error } = await admin.storage.from("creatives").createSignedUrl(c.storage_path!, download ? 300 : 3600, download ? { download: c.name } : undefined);
    if (error || !data) return bad("Could not open the file.", 502);
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, max-age=240" } });
  }

  const { data: src } = await admin.from("creative_sources").select("*").eq("id", c.source_id ?? "").maybeSingle();
  if (!src || src.client_id !== c.client_id || !c.external_id) return bad("This folder is no longer connected.", 404);
  try {
    const out = await cloudFileResponse(admin, src, c.external_id, { thumb, range: req.headers.get("range") });
    if ("redirect" in out) {
      if (!out.redirect.startsWith("https://")) return bad("Could not open the file.", 502);
      return NextResponse.redirect(out.redirect, { headers: { "Cache-Control": "private, max-age=240" } });
    }
    const up = out.response;
    if (!up.ok && up.status !== 206) return bad(up.status === 404 ? "Not found." : "Could not open the file.", up.status === 404 ? 404 : 502);
    const type = (up.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const safeType = thumb ? (type.startsWith("image/") && type !== "image/svg+xml" ? type : "image/jpeg") : SAFE.test(type) ? type : SAFE.test(c.mime ?? "") ? c.mime! : "application/octet-stream";
    const headers = new Headers({
      "Content-Type": safeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": disposition(download || safeType === "application/octet-stream" ? "attachment" : "inline", c.name),
    });
    for (const h of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const v = up.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(up.body, { status: up.status === 206 ? 206 : 200, headers });
  } catch (e) {
    const se = e instanceof SourceError ? e : null;
    if (se?.code === "not_found") return bad("Not found.", 404);
    if (se?.code === "auth") return bad("The folder's access expired. Connect it again.", 502);
    return bad("Could not open the file.", 502);
  }
}
