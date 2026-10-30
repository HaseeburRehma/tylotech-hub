import { Unzip, UnzipInflate } from "fflate";
import { fileType, folderForEntry, isJunkEntry, MAX_FILE_BYTES, type CreativeFolder } from "@/lib/creatives";

/**
 * Browser side of creative uploads. Zips are unpacked here, one file at a time
 * (a 2 GB zip never sits in memory whole), and every file goes straight to
 * storage through a signed link: our server only hands out links and records
 * what arrived.
 */

export interface UploadItem {
  name: string;
  /** Path inside a zip ("Instagram/Story.png"), else the name. */
  path: string;
  blob: Blob;
  folderId: string;
  lastModified?: number;
}

export type SkipReason = "type" | "size" | "zip";

const isZip = (f: File) => /\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed";

/** Every uploadable file in the selection, zips unpacked; the rest reported through `onSkip`. */
export async function* expandFiles(
  files: File[],
  folders: Pick<CreativeFolder, "id" | "name">[],
  fallbackId: string,
  onSkip: (name: string, why: SkipReason) => void,
): AsyncGenerator<UploadItem> {
  for (const file of files) {
    if (isZip(file)) {
      const stats = { entries: 0 };
      try {
        for await (const e of zipEntries(file, onSkip, stats)) {
          yield { name: e.path.split("/").pop() ?? e.path, path: e.path, blob: e.blob, folderId: folderForEntry(e.path, folders, fallbackId) };
        }
        if (!stats.entries) onSkip(file.name, "zip");
      } catch {
        onSkip(file.name, "zip");
      }
      continue;
    }
    if (!fileType(file.name)) onSkip(file.name, "type");
    else if (file.size > MAX_FILE_BYTES || file.size === 0) onSkip(file.name, "size");
    else yield { name: file.name, path: file.webkitRelativePath || file.name, blob: file, folderId: fallbackId, lastModified: file.lastModified };
  }
}

/** Files inside a zip, streamed: one entry in memory at a time. */
export async function* zipEntries(
  file: Blob,
  onSkip: (name: string, why: SkipReason) => void = () => {},
  stats: { entries: number } = { entries: 0 },
): AsyncGenerator<{ path: string; blob: Blob }> {
  const ready: { path: string; blob: Blob }[] = [];
  let failure: unknown = null;
  const unzip = new Unzip((entry) => {
    stats.entries++;
    const path = entry.name;
    if (path.endsWith("/") || isJunkEntry(path)) return;
    const base = path.split("/").pop() ?? path;
    if (!fileType(base)) return onSkip(base, "type");
    if (entry.originalSize != null && entry.originalSize > MAX_FILE_BYTES) return onSkip(base, "size");
    const chunks: Uint8Array[] = [];
    let size = 0;
    let dropped = false;
    entry.ondata = (err, chunk, final) => {
      if (err) {
        failure = err;
        return;
      }
      if (dropped) return;
      size += chunk.length;
      // The header can lie about the size (zip bombs): stop at the real cap.
      if (size > MAX_FILE_BYTES) {
        dropped = true;
        chunks.length = 0;
        onSkip(base, "size");
        return;
      }
      chunks.push(chunk);
      // Typed, or storage takes it for an unknown binary and refuses it.
      if (final && size > 0) ready.push({ path, blob: new Blob(chunks as BlobPart[], { type: fileType(base)!.mime }) });
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    unzip.push(value ?? new Uint8Array(0), done);
    if (failure) throw failure;
    while (ready.length) yield ready.shift()!;
    if (done) break;
  }
}

/** Hash (same file twice counts once), pixel size and video length; best effort. */
export async function fileMeta(blob: Blob, name: string): Promise<{ hash?: string; width?: number; height?: number; durationSec?: number }> {
  const out: { hash?: string; width?: number; height?: number; durationSec?: number } = {};
  const kind = fileType(name)?.kind;
  try {
    if (blob.size <= 300 * 1024 * 1024 && globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      out.hash = "sha256:" + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* no hash: counted by file */
  }
  try {
    if (kind === "image" && typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(blob);
      out.width = bmp.width;
      out.height = bmp.height;
      bmp.close();
    } else if (kind === "video" && typeof document !== "undefined") {
      Object.assign(out, await videoMeta(blob));
    }
  } catch {
    /* HEIC and some codecs can't be read in every browser */
  }
  return out;
}

function videoMeta(blob: Blob): Promise<{ width?: number; height?: number; durationSec?: number }> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const done = (r: { width?: number; height?: number; durationSec?: number }) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(r);
    };
    const timer = setTimeout(() => done({}), 5000);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () =>
      done({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, durationSec: Number.isFinite(v.duration) ? v.duration : undefined });
    v.onerror = () => done({});
    v.src = url;
  });
}
