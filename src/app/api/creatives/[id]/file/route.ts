import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { signCreativeLink, verifyCreativeLink, type LinkVariant } from "@/lib/creative-links";
import { cloudFileResponse, SourceError } from "@/lib/creative-sources";
import { parseStoragePath } from "@/lib/creatives";
import { bad, UUID_RE } from "@/lib/creatives-server";
import { getRateLimiter, ipKey } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SAFE = /^(image\/(jpeg|png|webp|gif|avif|heic|heif)|video\/(mp4|quicktime|webm|x-m4v)|application\/pdf)$/;
const COLS = "id,client_id,source,source_id,external_id,storage_path,name,mime,kind";
const THUMB_RE = /^[0-9a-f-]{36}\/(thumbs|previews)\/[0-9a-f-]{36}\.jpg$/;

const disposition = (kind: "inline" | "attachment", name: string) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/**
 * One creative: the file, ?thumb=1 (grid), ?preview=1 (a browser-friendly
 * full view, e.g. HEIC as JPEG), ?download=1 to save, ?json=1 for a link
 * instead of a redirect (the mobile app). Who may see it is decided by RLS
 * (the team, or the partner's own people); a signed link (?exp=&sig=) from
 * ?json=1 works without a session for 15 minutes.
 * Stored files get a short storage link; Dropbox and OneDrive a short direct
 * link; Google Drive files are streamed (with Range, so videos can seek).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return bad("Not found.", 404);
  const url = new URL(req.url);
  const q = url.searchParams;
  const thumb = q.get("thumb") === "1";
  const preview = !thumb && q.get("preview") === "1";
  const download = q.get("download") === "1";
  const asJson = q.get("json") === "1";
  const variant: LinkVariant = thumb ? "thumb" : preview ? "preview" : "file";
  const admin = createAdminClient();
  if (!admin) return bad("Backend not configured.", 503);

  // Signed link: no session, the signature names the creative and variant.
  const signed = q.has("sig") && verifyCreativeLink(params.id, variant, q.get("exp"), q.get("sig"));
  if (q.has("sig") && !signed) return bad("This link has expired.", 403);
  const user = signed ? null : await getAuthUser();
  if (!signed && !user) return bad("Unauthorized.", 401);
  const rl = await getRateLimiter().limit(`creative-file:${user?.id ?? ipKey(req)}`, { limit: 600, windowSec: 60 });
  if (!rl.success) return bad("Too many requests.", 429);

  const reader = signed ? admin : createClient();
  if (!reader) return bad("Backend not configured.", 503);
  let res = await reader.from("creatives").select(`${COLS},thumb_path,preview_path`).eq("id", params.id).maybeSingle();
  // Before 0050_creative_previews.sql there are no thumbnail columns.
  if (res.error) res = (await reader.from("creatives").select(COLS).eq("id", params.id).maybeSingle()) as typeof res;
  const c = res.data as
    | { id: string; client_id: string; source: string; source_id: string | null; external_id: string | null; storage_path: string | null; name: string; mime: string | null; kind: string; thumb_path?: string | null; preview_path?: string | null }
    | null;
  if (!c) return bad("Not found.", 404);

  // The app asks for a link it can hand to its player or the browser.
  if (asJson && !signed) {
    const own = (p?: string | null) => !!p && THUMB_RE.test(p) && p.startsWith(`${c.client_id}/`);
    const storePath = thumb && own(c.thumb_path) ? c.thumb_path! : preview && own(c.preview_path) ? c.preview_path! : c.storage_path;
    const stored = !!storePath && (own(storePath) || parseStoragePath(storePath)?.clientId === c.client_id);
    if (stored) {
      const { data } = await admin.storage.from("creatives").createSignedUrl(storePath!, 3600, download ? { download: c.name } : undefined);
      if (data) return NextResponse.json({ url: data.signedUrl, kind: c.kind, name: c.name });
    }
    return NextResponse.json({ url: signCreativeLink(url.origin, c.id, variant), kind: c.kind, name: c.name });
  }

  const redirect = (to: string) => NextResponse.redirect(to, { headers: { "Cache-Control": "private, max-age=240" } });

  // A made thumbnail or preview (always our own JPEG under this partner).
  const made = thumb ? c.thumb_path : preview ? c.preview_path : null;
  if (made && THUMB_RE.test(made) && made.startsWith(`${c.client_id}/`)) {
    const { data } = await admin.storage.from("creatives").createSignedUrl(made, 3600);
    if (data) return redirect(data.signedUrl);
  }

  // Stored with us: uploads, and files unpacked from zips in cloud folders.
  if (c.storage_path) {
    const p = parseStoragePath(c.storage_path);
    if (!p || p.clientId !== c.client_id) return bad("Not found.", 404);
    if (thumb && c.kind !== "image") return bad("No preview.", 404);
    const { data, error } = await admin.storage.from("creatives").createSignedUrl(c.storage_path, download ? 300 : 3600, download ? { download: c.name } : undefined);
    if (error || !data) return bad("Could not open the file.", 502);
    return redirect(data.signedUrl);
  }

  const { data: src } = await admin.from("creative_sources").select("*").eq("id", c.source_id ?? "").maybeSingle();
  if (!src || src.client_id !== c.client_id || !c.external_id) return bad("This folder is no longer connected.", 404);
  try {
    const out = await cloudFileResponse(admin, src, c.external_id, { thumb, range: req.headers.get("range") });
    if ("redirect" in out) {
      if (!out.redirect.startsWith("https://")) return bad("Could not open the file.", 502);
      return redirect(out.redirect);
    }
    const up = out.response;
    if (!up.ok && up.status !== 206) return bad(up.status === 404 ? "Not found." : "Could not open the file.", up.status === 404 ? 404 : 502);
    const type = (up.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const safeType = thumb ? (type.startsWith("image/") && type !== "image/svg+xml" ? type : "image/jpeg") : SAFE.test(type) ? type : SAFE.test(c.mime ?? "") ? c.mime! : "application/octet-stream";
    const headers = new Headers({
      "Content-Type": safeType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": disposition(download || safeType === "application/octet-stream" ? "attachment" : "inline", c.name),
    });
    // PDFs need the browser's viewer; everything else can't run anything at all.
    if (safeType !== "application/pdf") headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'");
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
