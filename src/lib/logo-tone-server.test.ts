import { deflateSync } from "zlib";
import { describe, expect, it } from "vitest";
import { pngTone, svgTone } from "./logo-tone-server";

type Px = [number, number, number, number];

function png(width: number, height: number, rgba: Px | ((x: number, y: number) => Px)) {
  const at = typeof rgba === "function" ? rgba : () => rgba;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(kind, "latin1"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const rows = Buffer.concat(
    Array.from({ length: height }, (_, y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => at(x, y)).flat()])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("logo tone (tile choice)", () => {
  it("white logo on transparency → dark tile", () => {
    expect(pngTone(png(8, 8, (x) => (x < 4 ? [255, 255, 255, 255] : [0, 0, 0, 0])))).toBe("light");
  });
  it("coloured logo on transparency → dark tile", () => {
    expect(pngTone(png(8, 8, (x) => (x < 4 ? [0, 255, 36, 255] : [0, 0, 0, 0])))).toBe("light");
  });
  it("transparent logo with dark lettering → white tile", () => {
    expect(pngTone(png(8, 8, (x, y) => (y < 2 ? [20, 20, 20, 255] : x < 4 ? [49, 170, 235, 255] : [0, 0, 0, 0])))).toBe("dark");
  });
  it("opaque dark logo (its own background) → dark tile", () => {
    expect(pngTone(png(8, 4, [11, 53, 66, 255]))).toBe("light");
  });
  it("fully transparent image → undecided", () => {
    expect(pngTone(png(8, 4, [0, 0, 0, 0]))).toBeNull();
  });
  it("reads SVG colours", () => {
    expect(svgTone('<svg><path fill="#fff"/><path style="fill:white"/></svg>')).toBe("light");
    expect(svgTone('<svg><path fill="#00FF24"/></svg>')).toBe("light");
    expect(svgTone('<svg><path style="fill: #31aaeb"/><path style="fill: #141414"/></svg>')).toBe("dark");
    expect(svgTone("<svg><path/></svg>")).toBe("dark");
  });
  it("rejects non-PNG data", () => {
    expect(pngTone(Buffer.from("not a png at all, definitely not"))).toBeNull();
  });
});
