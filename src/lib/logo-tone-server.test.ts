import { deflateSync } from "zlib";
import { describe, expect, it } from "vitest";
import { pngTone, svgTone } from "./logo-tone-server";

function png(width: number, height: number, rgba: [number, number, number, number]) {
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
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.from([0, ...Array.from({ length: width }, () => rgba).flat()])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("logo tone", () => {
  it("detects a white logo on transparency as light", () => {
    expect(pngTone(png(8, 4, [255, 255, 255, 255]))).toBe("light");
  });
  it("detects a dark logo as dark", () => {
    expect(pngTone(png(8, 4, [20, 40, 60, 255]))).toBe("dark");
  });
  it("ignores transparent pixels", () => {
    expect(pngTone(png(8, 4, [0, 0, 0, 0]))).toBeNull();
  });
  it("reads SVG fill colours", () => {
    expect(svgTone('<svg><path fill="#fff"/><path style="fill:white"/></svg>')).toBe("light");
    expect(svgTone('<svg><path fill="#01FE21"/></svg>')).toBe("dark");
    expect(svgTone("<svg><path/></svg>")).toBeNull();
  });
  it("rejects non-PNG data", () => {
    expect(pngTone(Buffer.from("not a png at all, definitely not"))).toBeNull();
  });
});
