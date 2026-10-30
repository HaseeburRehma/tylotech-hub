/**
 * Creatives library: shared types and rules (browser and server).
 * Files live per project under "Creatives" in category folders; see
 * supabase/migrations/0048_creatives.sql.
 */

export type CreativeKind = "image" | "video" | "document";
export type CreativeSourceProvider = "google_drive" | "dropbox" | "onedrive";

export interface CreativeFolder {
  id: string;
  client_id: string;
  project_id: string;
  name: string;
  position: number;
}

export interface Creative {
  id: string;
  client_id: string;
  project_id: string;
  folder_id: string;
  source: "upload" | CreativeSourceProvider;
  source_id: string | null;
  name: string;
  kind: CreativeKind;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  external_url: string | null;
  created_at: string;
  added_at: string;
}

/** What the page shows of a connected cloud folder (never the token). */
export interface CreativeSourceView {
  id: string;
  folder_id: string;
  project_id: string;
  provider: CreativeSourceProvider;
  label: string;
  account: string | null;
  status: "active" | "error" | "disconnected";
  last_error: string | null;
  last_synced_at: string | null;
  files: number;
}

export interface MonthCount {
  month: number; // 1..12
  total: number;
  images: number;
  videos: number;
  documents: number;
}

export const DEFAULT_FOLDERS = ["Social Media Design", "Social Media Videos", "Ad Creatives"];

/** Extension → stored content type. The server decides the type, never the browser. */
const TYPES: Record<string, { kind: CreativeKind; mime: string }> = {
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  png: { kind: "image", mime: "image/png" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  avif: { kind: "image", mime: "image/avif" },
  heic: { kind: "image", mime: "image/heic" },
  heif: { kind: "image", mime: "image/heif" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  webm: { kind: "video", mime: "video/webm" },
  m4v: { kind: "video", mime: "video/x-m4v" },
  pdf: { kind: "document", mime: "application/pdf" },
};

export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
export const MAX_FILE_BYTES = 500 * 1024 * 1024; // per file
export const MAX_BATCH = 50; // files per upload request

export function fileType(name: string): { kind: CreativeKind; mime: string } | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1];
  return ext ? TYPES[ext] ?? null : null;
}

/** Kind of a cloud file from its content type (Drive, Dropbox, OneDrive report it). */
export function kindFromMime(mime: string | null | undefined, name = ""): CreativeKind | null {
  const m = (mime ?? "").toLowerCase();
  if (m === "image/svg+xml") return null;
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf") return "document";
  return fileType(name)?.kind ?? null;
}

/** A storage-safe file name: letters, digits, dot, dash, underscore; at most 120 chars. */
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/ß/g, "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = base.replace(/[^a-zA-Z0-9.\-_]+/g, "_").replace(/^[._]+/, "").slice(-120);
  return cleaned || "file";
}

/** Display name for a file (no path, no control characters). */
export function displayName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return base.slice(0, 255) || "file";
}

export const storagePrefix = (clientId: string, projectId: string, folderId: string) => `${clientId}/${projectId}/${folderId}/`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID})/(${UUID})/(${UUID})/(${UUID})-([a-zA-Z0-9][a-zA-Z0-9.\\-_]{0,119})$`, "i");

/** Parts of an upload path we issued, or null for anything else. */
export function parseStoragePath(path: string) {
  const m = PATH_RE.exec(path);
  return m ? { clientId: m[1], projectId: m[2], folderId: m[3], fileName: m[5] } : null;
}

/** Skip OS clutter inside zips and folders. */
export function isJunkEntry(path: string): boolean {
  const parts = path.split("/");
  const base = parts[parts.length - 1] ?? "";
  return parts.some((p) => p === "__MACOSX") || base.startsWith(".") || base === "Thumbs.db" || base === "desktop.ini" || base === "";
}

/**
 * Which category a file from a zip goes to: a folder in the zip named like a
 * category ("Ad Creatives/Banner.png") wins; otherwise the chosen category.
 */
export function folderForEntry(path: string, folders: Pick<CreativeFolder, "id" | "name">[], fallbackId: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  const dirs = path.split("/").slice(0, -1).map(norm);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const hit = folders.find((f) => norm(f.name) === dirs[i]);
    if (hit) return hit.id;
  }
  return fallbackId;
}

/** Twelve months, zero-filled. */
export function fillYear(rows: Partial<MonthCount>[]): MonthCount[] {
  return Array.from({ length: 12 }, (_, i) => {
    const r = rows.find((x) => Number(x.month) === i + 1);
    return { month: i + 1, total: Number(r?.total ?? 0), images: Number(r?.images ?? 0), videos: Number(r?.videos ?? 0), documents: Number(r?.documents ?? 0) };
  });
}

export function humanBytes(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Postgres/PostgREST says the creatives tables are not there yet (migration 0048 not run). */
export const missingCreatives = (msg = "") => /creative|42P01|PGRST20[25]|does not exist|schema cache/i.test(msg);
