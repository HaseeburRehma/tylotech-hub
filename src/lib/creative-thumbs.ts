"use client";

import type { Creative } from "@/lib/creatives";
import { createClient } from "@/lib/supabase/client";

/**
 * Thumbnails and previews, made in the team's browser while they look at the
 * Creatives page (the server has no canvas, video or PDF renderer):
 *   thumb    480 px JPEG: video frame, PDF page 1, downscaled big photos
 *   preview  full JPEG for HEIC photos, which most browsers can't show
 * Stored once per creative; clients and the mobile app then simply load them.
 */

const THUMB_PX = 480;
const PREVIEW_PX = 2560;
const BIG_IMAGE = 400 * 1024;

export type ThumbCreative = Pick<Creative, "id" | "kind" | "name" | "size_bytes"> & { stored?: boolean; thumb_path?: string | null; preview_path?: string | null };

export const isHeic = (c: Pick<Creative, "name">) => /\.(heic|heif)$/i.test(c.name);

/** What a creative still needs: nothing for cloud files (their service makes thumbnails). */
export function missing(c: ThumbCreative): { thumb: boolean; preview: boolean } {
  if (!c.stored) return { thumb: false, preview: false };
  const thumb = !c.thumb_path && (c.kind === "video" || c.kind === "document" || isHeic(c) || (c.kind === "image" && (c.size_bytes ?? 0) > BIG_IMAGE));
  const preview = !c.preview_path && c.kind === "image" && isHeic(c);
  return { thumb, preview };
}

const fileUrl = (id: string) => `/api/creatives/${id}/file`;

function toJpeg(source: CanvasImageSource, w: number, h: number, max: number, quality = 0.82): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
}

async function fetchBlob(id: string): Promise<Blob> {
  const r = await fetch(fileUrl(id));
  if (!r.ok) throw new Error(`file ${r.status}`);
  return r.blob();
}

async function imageThumb(blob: Blob, max: number) {
  const bmp = await createImageBitmap(blob);
  try {
    return await toJpeg(bmp, bmp.width, bmp.height, max);
  } finally {
    bmp.close();
  }
}

/** A frame a little into the video (the first is often black). Streams only what it needs. */
function videoThumb(id: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const timer = setTimeout(() => done(new Error("timeout")), 20_000);
    const done = (err: Error | null, b?: Blob) => {
      clearTimeout(timer);
      v.removeAttribute("src");
      v.load();
      err ? reject(err) : resolve(b!);
    };
    v.crossOrigin = "anonymous"; // storage links allow it; keeps the canvas readable
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadedmetadata = () => (v.currentTime = Math.min(1, (v.duration || 2) / 3));
    v.onseeked = () => toJpeg(v, v.videoWidth, v.videoHeight, THUMB_PX).then((b) => done(null, b), (e) => done(e));
    v.onerror = () => done(new Error("video"));
    v.src = fileUrl(id);
  });
}

async function pdfThumb(blob: Blob): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;
  // isEvalSupported: false closes CVE-2024-4367 (crafted fonts running script).
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMB_PX / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    return toJpeg(canvas, canvas.width, canvas.height, THUMB_PX);
  } finally {
    await doc.destroy();
  }
}

async function heicJpeg(blob: Blob): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
  return Array.isArray(out) ? out[0] : out;
}

async function store(id: string, what: "thumb" | "preview", jpeg: Blob) {
  const supabase = createClient();
  if (!supabase) throw new Error("no backend");
  const call = (method: string) =>
    fetch(`/api/creatives/${id}/thumb`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ what }) }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `thumb ${r.status}`);
      return j as { path: string; token: string };
    });
  const { path, token } = await call("POST");
  const { error } = await supabase.storage.from("creatives").uploadToSignedUrl(path, token, new Blob([jpeg], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  await call("PUT");
}

/** Make and store what one creative is missing. */
export async function makeThumbs(c: ThumbCreative): Promise<void> {
  const need = missing(c);
  if (!need.thumb && !need.preview) return;
  if (c.kind === "video") return store(c.id, "thumb", await videoThumb(c.id));
  const blob = await fetchBlob(c.id);
  if (c.kind === "document") return store(c.id, "thumb", await pdfThumb(blob));
  const readable = isHeic(c) ? await heicJpeg(blob) : blob;
  if (need.preview) await store(c.id, "preview", await imageThumb(readable, PREVIEW_PX));
  if (need.thumb) await store(c.id, "thumb", await imageThumb(readable, THUMB_PX));
}
