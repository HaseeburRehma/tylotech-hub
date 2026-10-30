import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName, kindFromMime, type CreativeKind, type CreativeSourceProvider } from "@/lib/creatives";

/**
 * Cloud folders synced into a creatives category: Google Drive, Dropbox and
 * OneDrive / SharePoint. The partner's team pastes a folder link, signs in
 * once (read-only), and every image, video and PDF in that folder (and its
 * subfolders) shows up in the library. Files stay where they are: we keep a
 * reference and stream previews and downloads through our server.
 *
 * Google Drive uses the Google sign-in the rest of the app already uses
 * (GOOGLE_CLIENT_ID/SECRET). Dropbox needs DROPBOX_APP_KEY/SECRET and OneDrive
 * MICROSOFT_CLIENT_ID/SECRET; both redirect to /api/creatives/sources/callback.
 */

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DRIVE = "https://www.googleapis.com/drive/v3";
const GRAPH = "https://graph.microsoft.com/v1.0";
const DBX = "https://api.dropboxapi.com/2";
const DBX_CONTENT = "https://content.dropboxapi.com/2";

const MAX_FILES = 5000;
const MAX_DEPTH = 4;

interface OAuthDef {
  authUrl: string;
  tokenUrl: string;
  scope: string;
  idEnv: string;
  secretEnv: string;
  /** Google's redirect URI is the one already registered for integrations. */
  callbackPath: string;
  extra: Record<string, string>;
}

const OAUTH: Record<CreativeSourceProvider, OAuthDef> = {
  google_drive: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: DRIVE_SCOPE,
    idEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
    callbackPath: "/api/integrations/oauth/callback",
    extra: { access_type: "offline", prompt: "consent" },
  },
  dropbox: {
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scope: "account_info.read files.metadata.read files.content.read sharing.read",
    idEnv: "DROPBOX_APP_KEY",
    secretEnv: "DROPBOX_APP_SECRET",
    callbackPath: "/api/creatives/sources/callback",
    extra: { token_access_type: "offline" },
  },
  onedrive: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Files.Read.All",
    idEnv: "MICROSOFT_CLIENT_ID",
    secretEnv: "MICROSOFT_CLIENT_SECRET",
    callbackPath: "/api/creatives/sources/callback",
    extra: { prompt: "select_account" },
  },
};

export const CREATIVE_PROVIDERS: CreativeSourceProvider[] = ["google_drive", "dropbox", "onedrive"];
export const isCreativeProvider = (p: unknown): p is CreativeSourceProvider => CREATIVE_PROVIDERS.includes(p as CreativeSourceProvider);

/** Which providers have app credentials on this deployment. */
export function creativeProvidersReady(): Record<CreativeSourceProvider, boolean> {
  const ok = (p: CreativeSourceProvider) => !!(process.env[OAUTH[p].idEnv] && process.env[OAUTH[p].secretEnv]);
  return { google_drive: ok("google_drive"), dropbox: ok("dropbox"), onedrive: ok("onedrive") };
}

export class SourceError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: "auth" | "access" | "not_found" | "not_folder" | "rate" | "api_off" | "failed" = "failed",
  ) {
    super(message);
  }
}

// ---- Folder links -----------------------------------------------------------

/** The folder a pasted link points to, per provider; null when it isn't one. */
export function parseFolderLink(provider: CreativeSourceProvider, input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 2000) return null;
  if (provider === "google_drive") {
    const m = raw.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) ?? raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) ?? raw.match(/^([a-zA-Z0-9_-]{20,})$/);
    return m?.[1] ?? null;
  }
  if (provider === "dropbox") {
    if (raw.startsWith("/") && !raw.includes("..")) return raw.replace(/\/+$/, "") || null;
    return httpsOn(raw, /(^|\.)dropbox\.com$/) ? raw : null;
  }
  return httpsOn(raw, /(^|\.)(1drv\.ms|onedrive\.live\.com|onedrive\.com|sharepoint\.com)$/) ? raw : null;
}

function httpsOn(raw: string, host: RegExp) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && host.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

// ---- OAuth ------------------------------------------------------------------

export function creativeAuthUrl(provider: CreativeSourceProvider, origin: string, state: string): string | null {
  const def = OAUTH[provider];
  const id = process.env[def.idEnv];
  if (!id || !process.env[def.secretEnv]) return null;
  const u = new URL(def.authUrl);
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", origin + def.callbackPath);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", def.scope);
  for (const [k, v] of Object.entries(def.extra)) u.searchParams.set(k, v);
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenCall(provider: CreativeSourceProvider, body: Record<string, string>) {
  const def = OAUTH[provider];
  const id = process.env[def.idEnv];
  const secret = process.env[def.secretEnv];
  if (!id || !secret) throw new SourceError("not_configured", 503);
  const res = await fetch(def.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: id, client_secret: secret }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok || !json.access_token) throw new SourceError(json.error ?? `token ${res.status}`, res.status === 400 || res.status === 401 ? 401 : res.status, "auth");
  return json;
}

export async function exchangeCreativeCode(provider: CreativeSourceProvider, code: string, origin: string) {
  const tok = await tokenCall(provider, { code, grant_type: "authorization_code", redirect_uri: origin + OAUTH[provider].callbackPath });
  if (provider === "google_drive" && !String(tok.scope ?? "").split(/\s+/).includes(DRIVE_SCOPE)) throw new SourceError("missing_scope", 403, "access");
  if (!tok.refresh_token) throw new SourceError("no_refresh_token", 400, "auth");
  return { accessToken: tok.access_token!, refreshToken: tok.refresh_token, expiresIn: tok.expires_in ?? 3600 };
}

interface SourceRow {
  id: string;
  client_id: string;
  project_id: string;
  folder_id: string;
  provider: CreativeSourceProvider;
  external_id: string;
  label: string;
  access_token: string | null;
  status: string;
  last_synced_at: string | null;
  config: Record<string, any> | null;
}

/**
 * A working access token for a source: the cached one while it has a minute
 * left, else a fresh one from the refresh token (saved back, so a burst of
 * previews refreshes once). Microsoft rotates refresh tokens; the new one is kept.
 */
export async function sourceAccessToken(admin: SupabaseClient, src: SourceRow): Promise<string> {
  const cfg = src.config ?? {};
  if (cfg.accessToken && Number(cfg.accessExp) > Date.now() + 60_000) return String(cfg.accessToken);
  if (!src.access_token) throw new SourceError("no token", 401, "auth");
  const tok = await tokenCall(src.provider, { refresh_token: src.access_token, grant_type: "refresh_token" });
  const next = { ...cfg, accessToken: tok.access_token, accessExp: Date.now() + (tok.expires_in ?? 3600) * 1000 };
  src.config = next;
  const patch: Record<string, unknown> = { config: next };
  if (tok.refresh_token && tok.refresh_token !== src.access_token) {
    patch.access_token = tok.refresh_token;
    src.access_token = tok.refresh_token;
  }
  await admin.from("creative_sources").update(patch).eq("id", src.id);
  return tok.access_token!;
}

// ---- Provider calls ---------------------------------------------------------

export interface CloudFile {
  id: string;
  name: string;
  mime: string | null;
  kind: CreativeKind;
  size: number | null;
  hash: string | null;
  createdAt: string | null;
  webUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

async function call<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (res.ok) return (await res.json()) as T;
  const body = await res.text().catch(() => "");
  const s = res.status;
  if (s === 401) throw new SourceError("auth", 401, "auth");
  if (s === 429 || /rateLimitExceeded|userRateLimitExceeded|too_many_requests/.test(body)) throw new SourceError("rate", 429, "rate");
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/.test(body)) throw new SourceError("api_off", 403, "api_off");
  if (s === 403) throw new SourceError("access", 403, "access");
  if (s === 404 || /path\/not_found|shared_link_not_found|itemNotFound/.test(body)) throw new SourceError("not_found", 404, "not_found");
  if (s === 409 && /not_found/.test(body)) throw new SourceError("not_found", 404, "not_found");
  throw new SourceError(`${s} ${body.slice(0, 160)}`, s);
}

const dbxPost = <T>(path: string, token: string, body: unknown) =>
  call<T>(`${DBX}${path}`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const futureSafe = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return new Date(Math.min(t, Date.now())).toISOString();
};

/** The folder behind a link: checks access and returns its name and the signed-in account. */
export async function describeFolder(provider: CreativeSourceProvider, token: string, ref: string): Promise<{ externalId: string; name: string; account: string | null }> {
  if (provider === "google_drive") {
    const [f, about] = await Promise.all([
      call<{ id: string; name: string; mimeType: string }>(`${DRIVE}/files/${encodeURIComponent(ref)}?fields=id,name,mimeType&supportsAllDrives=true`, token),
      call<{ user?: { emailAddress?: string } }>(`${DRIVE}/about?fields=user(emailAddress)`, token).catch(() => ({}) as { user?: { emailAddress?: string } }),
    ]);
    if (f.mimeType !== "application/vnd.google-apps.folder") throw new SourceError("not_folder", 400, "not_folder");
    return { externalId: f.id, name: f.name, account: about.user?.emailAddress ?? null };
  }
  if (provider === "dropbox") {
    const account = await fetch(`${DBX}/users/get_current_account`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (ref.startsWith("/")) {
      const m = await dbxPost<{ ".tag": string; name: string }>("/files/get_metadata", token, { path: ref });
      if (m[".tag"] !== "folder") throw new SourceError("not_folder", 400, "not_folder");
      return { externalId: ref, name: m.name, account: account?.email ?? null };
    }
    const m = await dbxPost<{ ".tag": string; name: string }>("/sharing/get_shared_link_metadata", token, { url: ref });
    if (m[".tag"] !== "folder") throw new SourceError("not_folder", 400, "not_folder");
    return { externalId: ref, name: m.name, account: account?.email ?? null };
  }
  const shareId = "u!" + Buffer.from(ref).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  const [item, me] = await Promise.all([
    call<{ id: string; name: string; folder?: unknown; parentReference?: { driveId?: string } }>(`${GRAPH}/shares/${shareId}/driveItem`, token),
    call<{ mail?: string; userPrincipalName?: string }>(`${GRAPH}/me?$select=mail,userPrincipalName`, token).catch(() => ({}) as { mail?: string; userPrincipalName?: string }),
  ]);
  if (!item.folder || !item.parentReference?.driveId) throw new SourceError("not_folder", 400, "not_folder");
  return { externalId: `${item.parentReference.driveId}!${item.id}`, name: item.name, account: me.mail ?? me.userPrincipalName ?? null };
}

/** Every image, video and PDF in the folder and its subfolders (up to 5,000). */
export async function listFolderFiles(provider: CreativeSourceProvider, token: string, externalId: string): Promise<{ files: CloudFile[]; complete: boolean }> {
  const files: CloudFile[] = [];
  let complete = true;
  const push = (f: CloudFile | null) => {
    if (!f) return;
    if (files.length >= MAX_FILES) complete = false;
    else files.push(f);
  };

  if (provider === "google_drive") {
    const queue: { id: string; depth: number }[] = [{ id: externalId, depth: 0 }];
    const fields = "nextPageToken,files(id,name,mimeType,size,md5Checksum,createdTime,webViewLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))";
    while (queue.length && complete) {
      const { id, depth } = queue.shift()!;
      let page: string | undefined;
      do {
        const q = encodeURIComponent(`'${id.replace(/'/g, "")}' in parents and trashed = false`);
        const url = `${DRIVE}/files?q=${q}&fields=${encodeURIComponent(fields)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${page}` : ""}`;
        const res = await call<{ nextPageToken?: string; files: any[] }>(url, token);
        for (const f of res.files ?? []) {
          if (f.mimeType === "application/vnd.google-apps.folder") {
            if (depth < MAX_DEPTH) queue.push({ id: f.id, depth: depth + 1 });
            else complete = false;
            continue;
          }
          push(driveFile(f));
        }
        page = res.nextPageToken;
      } while (page && complete);
    }
    return { files, complete };
  }

  if (provider === "dropbox") {
    const shared = !externalId.startsWith("/");
    // Shared links list one level per call; paths can list everything at once.
    const queue: { path: string; depth: number }[] = [{ path: shared ? "" : externalId, depth: 0 }];
    while (queue.length && complete) {
      const { path, depth } = queue.shift()!;
      let res = await dbxPost<{ entries: any[]; cursor: string; has_more: boolean }>(
        "/files/list_folder",
        token,
        shared ? { path, shared_link: { url: externalId }, limit: 2000 } : { path, recursive: true, limit: 2000 },
      );
      for (;;) {
        for (const e of res.entries ?? []) {
          if (e[".tag"] === "folder") {
            if (shared && depth < MAX_DEPTH) queue.push({ path: `${path}/${e.name}`, depth: depth + 1 });
            continue;
          }
          if (e[".tag"] === "file") push(dropboxFile(e, shared ? `${path}/${e.name}` : null));
        }
        if (!res.has_more || !complete) break;
        res = await dbxPost("/files/list_folder/continue", token, { cursor: res.cursor });
      }
    }
    return { files, complete };
  }

  const [driveId, rootId] = externalId.split("!");
  const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }];
  const select = "id,name,file,folder,size,createdDateTime,webUrl,image,video,photo";
  while (queue.length && complete) {
    const { id, depth } = queue.shift()!;
    let url: string | undefined = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(id)}/children?$select=${select}&$top=999`;
    while (url && complete) {
      const res: { value: any[]; "@odata.nextLink"?: string } = await call(url, token);
      for (const it of res.value ?? []) {
        if (it.folder) {
          if (depth < MAX_DEPTH) queue.push({ id: it.id, depth: depth + 1 });
          else complete = false;
          continue;
        }
        push(oneDriveFile(it));
      }
      const next = res["@odata.nextLink"];
      url = next && next.startsWith(`${GRAPH}/`) ? next : undefined;
    }
  }
  return { files, complete };
}

export function driveFile(f: any): CloudFile | null {
  const kind = kindFromMime(f.mimeType, f.name);
  if (!kind || !f.id) return null;
  const v = f.videoMediaMetadata;
  const img = f.imageMediaMetadata;
  return {
    id: String(f.id),
    name: displayName(String(f.name ?? "file")),
    mime: f.mimeType ?? null,
    kind,
    size: f.size != null ? Number(f.size) : null,
    hash: f.md5Checksum ? `md5:${f.md5Checksum}` : null,
    createdAt: futureSafe(f.createdTime),
    webUrl: typeof f.webViewLink === "string" && f.webViewLink.startsWith("https://") ? f.webViewLink : null,
    width: Number(v?.width ?? img?.width) || null,
    height: Number(v?.height ?? img?.height) || null,
    durationSec: v?.durationMillis ? Math.round(Number(v.durationMillis) / 10) / 100 : null,
  };
}

/** Dropbox file; `sharedPath` is its path inside a shared link (for downloads). */
export function dropboxFile(e: any, sharedPath: string | null): CloudFile | null {
  const kind = kindFromMime(null, e.name ?? "");
  if (!kind || !e.id) return null;
  return {
    id: sharedPath ? `${e.id}|${sharedPath}` : String(e.id),
    name: displayName(String(e.name)),
    mime: null,
    kind,
    size: e.size != null ? Number(e.size) : null,
    hash: e.content_hash ? `dropbox:${e.content_hash}` : null,
    createdAt: futureSafe(e.client_modified ?? e.server_modified),
    webUrl: null,
    width: null,
    height: null,
    durationSec: null,
  };
}

export function oneDriveFile(it: any): CloudFile | null {
  if (!it.file) return null;
  const kind = kindFromMime(it.file.mimeType, it.name ?? "");
  if (!kind) return null;
  const h = it.file.hashes ?? {};
  return {
    id: String(it.id),
    name: displayName(String(it.name)),
    mime: it.file.mimeType ?? null,
    kind,
    size: it.size != null ? Number(it.size) : null,
    hash: h.sha256Hash ? `sha256:${String(h.sha256Hash).toLowerCase()}` : h.quickXorHash ? `qxh:${h.quickXorHash}` : null,
    createdAt: futureSafe(it.photo?.takenDateTime ?? it.createdDateTime),
    webUrl: typeof it.webUrl === "string" && it.webUrl.startsWith("https://") ? it.webUrl : null,
    width: Number(it.image?.width ?? it.video?.width) || null,
    height: Number(it.image?.height ?? it.video?.height) || null,
    durationSec: it.video?.duration ? Math.round(Number(it.video.duration) / 10) / 100 : null,
  };
}

// ---- Sync -------------------------------------------------------------------

export const SOURCE_ERROR_TEXT: Record<string, string> = {
  auth: "Access expired or was revoked. Connect the folder again.",
  access: "The signed-in account can't open this folder any more.",
  not_found: "Folder not found. It was moved, deleted or unshared.",
  not_folder: "The link points to a file, not a folder.",
  api_off: "The Google Drive API is switched off for this app (Google Cloud Console: enable Google Drive API).",
};

const errorText = (e: unknown) => {
  const se = e instanceof SourceError ? e : null;
  return (se && SOURCE_ERROR_TEXT[se.code]) || "Sync failed. Try again in a few minutes.";
};

/**
 * Bring connected folders up to date: new files appear, renamed ones update,
 * removed ones leave the library (only when the folder was read completely).
 * `minIntervalMs` skips folders read recently (the poll uses 10 minutes;
 * "Sync now" passes a sourceId and always runs).
 */
export async function syncCreativeSources(
  admin: SupabaseClient,
  opts: { sourceId?: string; minIntervalMs?: number; budgetMs?: number } = {},
): Promise<{ synced: number; added: number; removed: number }> {
  const t0 = Date.now();
  let q = admin.from("creative_sources").select("*").neq("status", "disconnected");
  if (opts.sourceId) q = q.eq("id", opts.sourceId);
  const { data, error } = await q;
  if (error || !data) return { synced: 0, added: 0, removed: 0 };
  const now = Date.now();
  const due = (data as SourceRow[])
    .filter((s) => opts.sourceId || !opts.minIntervalMs || !s.last_synced_at || now - Date.parse(s.last_synced_at) >= opts.minIntervalMs)
    .filter((s) => opts.sourceId || !(Number(Date.parse(s.config?.retryAt ?? "")) > now))
    .sort((a, b) => (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? ""));

  let synced = 0, added = 0, removed = 0;
  for (const src of due) {
    if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break;
    try {
      const r = await syncOne(admin, src);
      synced++;
      added += r.added;
      removed += r.removed;
    } catch (e) {
      const se = e instanceof SourceError ? e : null;
      if (se?.code === "rate") {
        await admin.from("creative_sources").update({ config: { ...(src.config ?? {}), retryAt: new Date(Date.now() + 5 * 60_000).toISOString() } }).eq("id", src.id);
        continue;
      }
      // An expired token or a lost folder needs a person; anything else may pass.
      const hard = se && ["auth", "access", "not_found", "not_folder", "api_off"].includes(se.code);
      await admin
        .from("creative_sources")
        .update({ last_error: errorText(e), last_synced_at: new Date().toISOString(), ...(hard ? { status: "error" } : {}) })
        .eq("id", src.id);
    }
  }
  return { synced, added, removed };
}

async function syncOne(admin: SupabaseClient, src: SourceRow) {
  const token = await sourceAccessToken(admin, src);
  const { files, complete } = await listFolderFiles(src.provider, token, src.external_id);

  const { data: existing } = await admin.from("creatives").select("id,external_id").eq("source_id", src.id).limit(MAX_FILES + 1000);
  const known = new Map(((existing ?? []) as { id: string; external_id: string }[]).map((r) => [r.external_id, r.id]));

  const rows = files.map((f) => ({
    client_id: src.client_id,
    project_id: src.project_id,
    folder_id: src.folder_id,
    source: src.provider,
    source_id: src.id,
    external_id: f.id,
    name: f.name,
    kind: f.kind,
    mime: f.mime,
    size_bytes: f.size,
    width: f.width,
    height: f.height,
    duration_sec: f.durationSec,
    content_hash: f.hash,
    external_url: f.webUrl,
    ...(f.createdAt ? { created_at: f.createdAt } : {}),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("creatives").upsert(rows.slice(i, i + 500), { onConflict: "source_id,external_id" });
    if (error) throw new SourceError(error.message, 500);
  }
  const added = files.filter((f) => !known.has(f.id)).length;

  let removed = 0;
  if (complete) {
    const seen = new Set(files.map((f) => f.id));
    const gone = Array.from(known.entries()).filter(([ext]) => !seen.has(ext)).map(([, id]) => id);
    for (let i = 0; i < gone.length; i += 200) {
      await admin.from("creatives").delete().in("id", gone.slice(i, i + 200));
    }
    removed = gone.length;
  }

  const cfg = { ...(src.config ?? {}) };
  delete cfg.retryAt;
  await admin
    .from("creative_sources")
    .update({ status: "active", last_error: complete ? null : "Only the first 5,000 files are shown.", last_synced_at: new Date().toISOString(), config: cfg })
    .eq("id", src.id);
  return { added, removed };
}

// ---- Previews and downloads ---------------------------------------------------

/**
 * How to show one cloud file: a short-lived direct link (Dropbox, OneDrive)
 * or a response streamed from the provider (Google Drive has no such links).
 */
export async function cloudFileResponse(
  admin: SupabaseClient,
  src: SourceRow,
  externalId: string,
  opts: { thumb?: boolean; range?: string | null },
): Promise<{ redirect: string } | { response: Response }> {
  const token = await sourceAccessToken(admin, src);
  if (src.provider === "google_drive") {
    if (opts.thumb) {
      const meta = await call<{ thumbnailLink?: string }>(`${DRIVE}/files/${encodeURIComponent(externalId)}?fields=thumbnailLink&supportsAllDrives=true`, token);
      if (!meta.thumbnailLink) throw new SourceError("no thumb", 404, "not_found");
      const link = meta.thumbnailLink.replace(/=s\d+$/, "=s480");
      return { response: await fetch(link, { headers: { Authorization: `Bearer ${token}` } }) };
    }
    const res = await fetch(`${DRIVE}/files/${encodeURIComponent(externalId)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}`, ...(opts.range ? { Range: opts.range } : {}) },
    });
    return { response: res };
  }
  if (src.provider === "dropbox") {
    const [id, sharedPath] = externalId.split("|");
    if (opts.thumb) {
      const resource = sharedPath ? { ".tag": "link", url: src.external_id, path: sharedPath } : { ".tag": "path", path: id };
      const res = await fetch(`${DBX_CONTENT}/files/get_thumbnail_v2`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ resource, format: "jpeg", size: "w480h320", mode: "bestfit" }) },
      });
      return { response: res };
    }
    if (sharedPath) {
      const res = await fetch(`${DBX_CONTENT}/sharing/get_shared_link_file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ url: src.external_id, path: sharedPath }), ...(opts.range ? { Range: opts.range } : {}) },
      });
      return { response: res };
    }
    const { link } = await dbxPost<{ link: string }>("/files/get_temporary_link", token, { path: id });
    return { redirect: link };
  }
  const [driveId] = src.external_id.split("!");
  const base = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(externalId)}`;
  if (opts.thumb) {
    const t = await call<{ url?: string }>(`${base}/thumbnails/0/medium`, token);
    if (!t.url?.startsWith("https://")) throw new SourceError("no thumb", 404, "not_found");
    return { redirect: t.url };
  }
  const item = await call<{ "@microsoft.graph.downloadUrl"?: string }>(`${base}?$select=id,@microsoft.graph.downloadUrl`, token);
  const link = item["@microsoft.graph.downloadUrl"];
  if (!link?.startsWith("https://")) throw new SourceError("no link", 404, "not_found");
  return { redirect: link };
}
