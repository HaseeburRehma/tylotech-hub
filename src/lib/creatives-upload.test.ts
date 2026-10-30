import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { expandFiles, fileMeta, zipEntries } from "./creatives-upload";

const zipFile = (entries: Record<string, Uint8Array>, name = "batch.zip") => new File([zipSync(entries) as BlobPart], name, { type: "application/zip" });

describe("zip uploads", () => {
  it("unpacks images, videos and PDFs; skips clutter and unsafe types", async () => {
    const skips: string[] = [];
    const out: string[] = [];
    const z = zipFile({
      "Ad Creatives/Banner.png": strToU8("png-bytes"),
      "Ad Creatives/sub/Reel.mp4": strToU8("mp4-bytes"),
      "__MACOSX/Ad Creatives/._Banner.png": strToU8("x"),
      "notes.txt": strToU8("hi"),
      "evil.svg": strToU8("<svg onload=alert(1)>"),
      "empty/": new Uint8Array(0),
    });
    for await (const e of zipEntries(z, (n, why) => skips.push(`${n}:${why}`))) out.push(`${e.path}:${await e.blob.text()}`);
    expect(out.sort()).toEqual(["Ad Creatives/Banner.png:png-bytes", "Ad Creatives/sub/Reel.mp4:mp4-bytes"]);
    expect(skips.sort()).toEqual(["evil.svg:type", "notes.txt:type"]);
  });

  it("files land in the category named by their zip folder, the rest in the chosen one", async () => {
    const folders = [
      { id: "design", name: "Social Media Design" },
      { id: "ads", name: "Ad Creatives" },
    ];
    const items: string[] = [];
    const skips: string[] = [];
    const files = [
      zipFile({ "Ad Creatives/A.jpg": strToU8("a"), "Loose.jpg": strToU8("b") }),
      new File(["c"], "Direct.webp", { type: "image/webp" }),
      new File(["d"], "virus.exe"),
      new File([], "Empty.png"),
      new File(["not a zip"], "broken.zip", { type: "application/zip" }),
    ];
    for await (const it of expandFiles(files, folders, "design", (n, w) => skips.push(`${n}:${w}`))) items.push(`${it.name}>${it.folderId}`);
    expect(items).toEqual(["A.jpg>ads", "Loose.jpg>design", "Direct.webp>design"]);
    expect(skips).toEqual(["virus.exe:type", "Empty.png:size", "broken.zip:zip"]);
  });

  it("hashes files so the same creative twice counts once", async () => {
    const a = await fileMeta(new Blob(["same"]), "a.pdf");
    const b = await fileMeta(new Blob(["same"]), "b.pdf");
    expect(a.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(a.hash).toBe(b.hash);
  });
});
