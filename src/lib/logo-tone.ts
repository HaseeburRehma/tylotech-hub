"use client";

import { useEffect, useState } from "react";

/**
 * Which tile a logo sits on. Logos get a dark tile by default; only a
 * transparent logo with real near-black parts (e.g. dark lettering) gets a
 * white tile, because those parts would vanish on dark. Returns the logo's
 * tone: "dark" → needs the white tile, "light" → dark tile. Sampled once per URL
 * on a tiny canvas; failures keep the dark tile.
 */
type Tone = "light" | "dark";
const cache = new Map<string, Promise<Tone>>();

function sample(src: string): Promise<Tone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve("light");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let opaque = 0;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 64) continue;
          opaque++;
          if (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]! < 70) dark++;
        }
        const transparent = opaque < size * size * 0.95;
        resolve(transparent && opaque > 0 && dark / opaque > 0.06 ? "dark" : "light");
      } catch {
        resolve("light");
      }
    };
    img.onerror = () => resolve("light");
    img.src = src;
  });
}

export function useLogoTone(src: string | null | undefined): Tone {
  const [tone, setTone] = useState<Tone>("light");
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
