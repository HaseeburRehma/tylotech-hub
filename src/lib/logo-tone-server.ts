import { inflateSync } from "zlib";

/**
 * Server-side "is this logo mostly light?" for apps that can't sample pixels
 * (the mobile app). PNG is decoded with zlib; SVG is judged by its fill /
 * stroke colours; anything else (AVIF, JPEG, …) is treated as dark, which keeps
 * the default white tile. The web app does the same check in the browser.
 */
export type LogoTone = "light" | "dark";

const LIGHT_LUMA = 215;
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function pngTone(buf: Buffer): LogoTone | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]!;
      type = data[9]!;
      interlace = data[12]!;
    } else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    off += 12 + len;
  }
  // Keep it simple: 8-bit, non-interlaced (what logo exports almost always are).
  if (!width || !height || depth !== 8 || interlace !== 0) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!channels || (type === 3 && !palette)) return null;

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let sum = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.max(width, height) / 64)); // sample ~64×64

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let v = line[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    if (y % step === 0) {
      for (let x = 0; x < width; x += step) {
        const i = x * channels;
        let r: number, g: number, bl: number, alpha = 255;
        if (type === 3) {
          const idx = cur[i]!;
          r = palette![idx * 3]!; g = palette![idx * 3 + 1]!; bl = palette![idx * 3 + 2]!;
          if (trns && idx < trns.length) alpha = trns[idx]!;
        } else if (type === 0 || type === 4) {
          r = g = bl = cur[i]!;
          if (type === 4) alpha = cur[i + 1]!;
        } else {
          r = cur[i]!; g = cur[i + 1]!; bl = cur[i + 2]!;
          if (type === 6) alpha = cur[i + 3]!;
        }
        if (alpha < 64) continue;
        sum += luma(r, g, bl);
        n++;
      }
    }
    prev.set(cur);
  }
  if (!n) return null;
  return sum / n > LIGHT_LUMA ? "light" : "dark";
}

const NAMED: Record<string, [number, number, number]> = { white: [255, 255, 255], black: [0, 0, 0] };

export function svgTone(svg: string): LogoTone | null {
  const colors: [number, number, number][] = [];
  const re = /(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)/gi;
  for (const m of Array.from(svg.matchAll(re))) {
    const v = m[1]!.toLowerCase();
    if (NAMED[v]) colors.push(NAMED[v]!);
    else if (v.startsWith("#")) {
      const h = v.length <= 5 ? v.slice(1, 4).split("").map((x) => x + x).join("") : v.slice(1, 7);
      colors.push([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
    } else {
      const nums = v.match(/[\d.]+/g)?.map(Number) ?? [];
      if (nums.length >= 3) colors.push([nums[0]!, nums[1]!, nums[2]!]);
    }
  }
  if (!colors.length) return null; // default fill is black → dark
  const avg = colors.reduce((s, [r, g, b]) => s + luma(r, g, b), 0) / colors.length;
  return avg > LIGHT_LUMA ? "light" : "dark";
}

const cache = new Map<string, LogoTone>();

export async function logoTone(url: string | null | undefined): Promise<LogoTone> {
  if (!url) return "dark";
  const hit = cache.get(url);
  if (hit) return hit;
  let tone: LogoTone = "dark";
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (res.ok) {
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length <= 5 * 1024 * 1024) {
        tone = (type.includes("svg") ? svgTone(buf.toString("utf8")) : pngTone(buf)) ?? "dark";
      }
    }
  } catch {
    /* keep "dark" */
  }
  cache.set(url, tone);
  return tone;
}
