"use client";

import { useEffect, useState } from "react";

/**
 * Is a logo mostly light (e.g. a white wordmark on transparency)? Then it needs
 * a dark tile behind it instead of the default white one. Sampled once per URL
 * on a tiny canvas; any failure (CORS, decode) keeps the white tile.
 */
type Tone = "light" | "dark";
const cache = new Map<string, Promise<Tone>>();

function sample(src: string): Promise<Tone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve("dark");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 64) continue; // ignore transparent pixels
          sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
          n++;
        }
        resolve(n > 0 && sum / n > 215 ? "light" : "dark");
      } catch {
        resolve("dark");
      }
    };
    img.onerror = () => resolve("dark");
    img.src = src;
  });
}

export function useLogoTone(src: string | null | undefined): Tone {
  const [tone, setTone] = useState<Tone>("dark");
  useEffect(() => {
    if (!src) return;
    let alive = true;
    let p = cache.get(src);
    if (!p) {
      p = sample(src);
      cache.set(src, p);
    }
    p.then((t) => alive && setTone(t));
    return () => {
      alive = false;
    };
  }, [src]);
  return tone;
}
