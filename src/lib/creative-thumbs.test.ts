import { describe, expect, it } from "vitest";
import { isHeic, missing } from "./creative-thumbs";

const base = { id: "x", name: "a.png", kind: "image" as const, size_bytes: 10_000, stored: true, thumb_path: null, preview_path: null };

describe("which files need a thumbnail or preview", () => {
  it("stored videos, PDFs, HEIC and big photos; never cloud files or done ones", () => {
    expect(missing({ ...base, kind: "video", name: "r.mp4" })).toEqual({ thumb: true, preview: false });
    expect(missing({ ...base, kind: "document", name: "d.pdf" })).toEqual({ thumb: true, preview: false });
    expect(missing({ ...base, name: "IMG_1.HEIC" })).toEqual({ thumb: true, preview: true });
    expect(missing({ ...base, size_bytes: 3_000_000 })).toEqual({ thumb: true, preview: false });
    expect(missing(base)).toEqual({ thumb: false, preview: false }); // small photo: shown as is
    expect(missing({ ...base, stored: false, kind: "video" })).toEqual({ thumb: false, preview: false });
    expect(missing({ ...base, kind: "video", thumb_path: "t" })).toEqual({ thumb: false, preview: false });
    expect(isHeic({ name: "x.heif" })).toBe(true);
  });
});
