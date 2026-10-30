import { describe, expect, it } from "vitest";
import { displayName, fileType, fillYear, folderForEntry, isJunkEntry, kindFromMime, missingCreatives, parseStoragePath, safeFileName, storagePrefix } from "./creatives";

const C = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const F = "33333333-3333-4333-8333-333333333333";
const U = "44444444-4444-4444-8444-444444444444";

describe("creative files", () => {
  it("types come from the extension; script-capable types are refused", () => {
    expect(fileType("Banner.PNG")).toEqual({ kind: "image", mime: "image/png" });
    expect(fileType("reel.mov")).toEqual({ kind: "video", mime: "video/quicktime" });
    expect(fileType("deck.pdf")?.kind).toBe("document");
    for (const bad of ["logo.svg", "x.html", "x.htm", "run.js", "noext", "img.png.exe", "a.zip"]) expect(fileType(bad)).toBeNull();
    expect(kindFromMime("image/svg+xml", "a.svg")).toBeNull();
    expect(kindFromMime("video/mp4")).toBe("video");
    expect(kindFromMime("application/octet-stream", "a.jpg")).toBe("image");
  });

  it("names are made safe for storage and display", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("Größe Ü Banner (1).png")).toBe("Grosse_U_Banner_1_.png");
    expect(safeFileName("..hidden.png")).toBe("hidden.png");
    expect(safeFileName("???")).toBe("file");
    expect(safeFileName("a".repeat(300) + ".png").length).toBe(120);
    expect(displayName("folder/sub/<img src=x onerror=alert(1)>\u0000.png")).toBe("<img src=x onerror=alert(1)>.png"); // React prints it as text
  });

  it("only upload paths we issue are accepted", () => {
    const ok = `${storagePrefix(C, P, F)}${U}-Banner_1.png`;
    expect(parseStoragePath(ok)).toEqual({ clientId: C, projectId: P, folderId: F, fileName: "Banner_1.png" });
    for (const bad of [
      `${C}/${P}/${F}/../${U}-x.png`,
      `${C}/${P}/${U}-x.png`,
      `${C}/${P}/${F}/${U}-.png`,
      `${C}/${P}/${F}/${U}-x y.png`,
      `/${C}/${P}/${F}/${U}-x.png`,
      `${C}/${P}/${F}/${U}-x.png/..`,
      "https://evil.example/x.png",
    ])
      expect(parseStoragePath(bad)).toBeNull();
  });

  it("zip clutter is skipped and zip folders pick the category", () => {
    expect(isJunkEntry("__MACOSX/._a.png")).toBe(true);
    expect(isJunkEntry("Ad Creatives/.DS_Store")).toBe(true);
    expect(isJunkEntry("Thumbs.db")).toBe(true);
    expect(isJunkEntry("Ad Creatives/a.png")).toBe(false);
    const folders = [
      { id: "f1", name: "Social Media Design" },
      { id: "f2", name: "Ad Creatives" },
    ];
    expect(folderForEntry("Oktober/ad-creatives/Banner.png", folders, "fx")).toBe("f2");
    expect(folderForEntry("Social_Media_Design/Post.jpg", folders, "fx")).toBe("f1");
    expect(folderForEntry("Random/Post.jpg", folders, "fx")).toBe("fx");
    expect(folderForEntry("Post.jpg", folders, "fx")).toBe("fx");
  });

  it("a year always has twelve months", () => {
    const y = fillYear([{ month: 9, total: 5, images: 3, videos: 2 }]);
    expect(y).toHaveLength(12);
    expect(y[8]).toEqual({ month: 9, total: 5, images: 3, videos: 2, documents: 0 });
    expect(y[0].total).toBe(0);
  });

  it("knows when the migration is missing", () => {
    expect(missingCreatives('relation "public.creatives" does not exist')).toBe(true);
    expect(missingCreatives("permission denied for table users")).toBe(false);
  });
});
