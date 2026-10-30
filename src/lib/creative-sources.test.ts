import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test-fake-db";
import { creativeAuthUrl, driveFile, dropboxFile, oneDriveFile, parseFolderLink, syncCreativeSources } from "./creative-sources";

vi.mock("@/lib/background", () => ({ inBackground: vi.fn() }));

describe("folder links", () => {
  it("Google Drive: folder links and ids only", () => {
    expect(parseFolderLink("google_drive", "https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOpQrStUv?usp=sharing")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(parseFolderLink("google_drive", "https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQ")).toBe("1AbCdEfGhIjKlMnOpQ");
    expect(parseFolderLink("google_drive", "1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(parseFolderLink("google_drive", "' or 1=1 --")).toBeNull();
  });
  it("Dropbox: https dropbox.com links or plain paths", () => {
    expect(parseFolderLink("dropbox", "https://www.dropbox.com/scl/fo/abc/xyz?rlkey=k&dl=0")).toBe("https://www.dropbox.com/scl/fo/abc/xyz?rlkey=k&dl=0");
    expect(parseFolderLink("dropbox", "/Clients/Creatives/")).toBe("/Clients/Creatives");
    for (const bad of ["http://www.dropbox.com/scl/fo/a", "https://dropbox.com.evil.io/x", "https://user:pw@www.dropbox.com/x", "/a/../b", "javascript:alert(1)"]) expect(parseFolderLink("dropbox", bad)).toBeNull();
  });
  it("OneDrive / SharePoint: Microsoft hosts only", () => {
    expect(parseFolderLink("onedrive", "https://contoso.sharepoint.com/:f:/s/Marketing/EabC")).toBeTruthy();
    expect(parseFolderLink("onedrive", "https://1drv.ms/f/s!AbC")).toBeTruthy();
    expect(parseFolderLink("onedrive", "https://sharepoint.com.attacker.net/:f:/x")).toBeNull();
    expect(parseFolderLink("onedrive", "https://169.254.169.254/latest")).toBeNull();
  });
  it("sign-in links ask for read-only access and carry the state", () => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gs";
    const u = new URL(creativeAuthUrl("google_drive", "https://www.tylohq.de", "STATE")!);
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.readonly");
    expect(u.searchParams.get("redirect_uri")).toBe("https://www.tylohq.de/api/integrations/oauth/callback");
    expect(u.searchParams.get("state")).toBe("STATE");
    delete process.env.DROPBOX_APP_KEY;
    expect(creativeAuthUrl("dropbox", "https://www.tylohq.de", "S")).toBeNull();
  });
});

describe("cloud files", () => {
  it("map to creatives: kind, hash, size, dimensions; folders, docs and SVGs skipped", () => {
    expect(driveFile({ id: "d1", name: "Post.png", mimeType: "image/png", size: "2048", md5Checksum: "abc", createdTime: "2026-09-02T10:00:00Z", webViewLink: "https://drive.google.com/file/d/d1", imageMediaMetadata: { width: 1080, height: 1350 } })).toMatchObject({
      id: "d1",
      kind: "image",
      size: 2048,
      hash: "md5:abc",
      width: 1080,
      height: 1350,
      webUrl: "https://drive.google.com/file/d/d1",
    });
    expect(driveFile({ id: "v", name: "Reel.mp4", mimeType: "video/mp4", videoMediaMetadata: { width: 1080, height: 1920, durationMillis: "15500" } })).toMatchObject({ kind: "video", durationSec: 15.5 });
    expect(driveFile({ id: "g", name: "Notes", mimeType: "application/vnd.google-apps.document" })).toBeNull();
    expect(driveFile({ id: "s", name: "x.svg", mimeType: "image/svg+xml" })).toBeNull();
    expect(driveFile({ id: "j", name: "x.png", mimeType: "image/png", webViewLink: "javascript:alert(1)" })!.webUrl).toBeNull();
    expect(driveFile({ id: "f", name: "x.png", mimeType: "image/png", createdTime: "2999-01-01T00:00:00Z" })!.createdAt! <= new Date().toISOString()).toBe(true);
    expect(dropboxFile({ id: "id:1", name: "Ad.jpg", size: 10, content_hash: "h", client_modified: "2026-08-01T00:00:00Z" }, null)).toMatchObject({ id: "id:1", kind: "image", hash: "dropbox:h" });
    expect(dropboxFile({ id: "id:2", name: "Ad.jpg" }, "/sub/Ad.jpg")!.id).toBe("id:2|/sub/Ad.jpg");
    expect(oneDriveFile({ id: "o1", name: "Clip.mov", size: 5, file: { mimeType: "video/quicktime", hashes: { sha256Hash: "ABC" } }, video: { duration: 3000 } })).toMatchObject({ kind: "video", hash: "sha256:abc", durationSec: 3 });
    expect(oneDriveFile({ id: "o2", name: "Sub", folder: {} })).toBeNull();
  });
});

describe("syncCreativeSources (Google Drive)", () => {
  const SRC = { id: "s1", client_id: "c1", project_id: "p1", folder_id: "f1", provider: "google_drive", external_id: "ROOT", label: "Creatives", access_token: "refresh", status: "active", last_synced_at: null, config: {} };
  let db: ReturnType<typeof fakeDb>;
  let drive: Record<string, any[]>;
  let status = 200;
  let calls: string[] = [];

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gs";
    status = 200;
    calls = [];
    db = fakeDb({ creative_sources: [{ ...SRC }], creatives: [] });
    drive = {
      ROOT: [
        { id: "a", name: "A.png", mimeType: "image/png", md5Checksum: "1", createdTime: "2026-09-01T10:00:00Z" },
        { id: "sub", name: "October", mimeType: "application/vnd.google-apps.folder" },
        { id: "doc", name: "Brief", mimeType: "application/vnd.google-apps.document" },
      ],
      sub: [{ id: "b", name: "B.mp4", mimeType: "video/mp4", createdTime: "2026-10-01T10:00:00Z" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }));
        if (status !== 200) return new Response(JSON.stringify({ error: { message: "x" } }), { status });
        const parent = decodeURIComponent(new URL(url).searchParams.get("q") ?? "").match(/'([^']+)' in parents/)?.[1] ?? "";
        return new Response(JSON.stringify({ files: drive[parent] ?? [] }));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the folder and its subfolders, then mirrors removals", async () => {
    expect(await syncCreativeSources(db.client, {})).toEqual({ synced: 1, added: 2, removed: 0 });
    expect(db.tables.creatives.map((c) => `${c.external_id}:${c.kind}:${c.folder_id}`).sort()).toEqual(["a:image:f1", "b:video:f1"]);
    expect(db.tables.creatives.find((c) => c.external_id === "a")).toMatchObject({ client_id: "c1", project_id: "p1", source: "google_drive", content_hash: "md5:1", created_at: "2026-09-01T10:00:00.000Z" });
    expect(db.tables.creative_sources[0]).toMatchObject({ status: "active", last_error: null });
    // The access token is cached: a second run doesn't ask Google for a new one.
    drive.ROOT = drive.ROOT.filter((f) => f.id !== "a");
    calls = [];
    expect(await syncCreativeSources(db.client, { sourceId: "s1" })).toEqual({ synced: 1, added: 0, removed: 1 });
    expect(calls.some((u) => u.includes("/token"))).toBe(false);
    expect(db.tables.creatives.map((c) => c.external_id)).toEqual(["b"]);
  });

  it("new files get platforms from their folders; the team's tags on known files are kept", async () => {
    drive.sub = [{ id: "b", name: "B.mp4", mimeType: "video/mp4" }];
    drive.ROOT[1] = { id: "sub", name: "TikTok", mimeType: "application/vnd.google-apps.folder" };
    await syncCreativeSources(db.client, {});
    expect(db.tables.creatives.find((c) => c.external_id === "b")!.platforms).toEqual(["tiktok"]);
    expect(db.tables.creatives.find((c) => c.external_id === "a")!.platforms).toEqual([]);
    db.tables.creatives.find((c) => c.external_id === "b")!.platforms = ["instagram"];
    db.tables.creatives.find((c) => c.external_id === "b")!.campaign = "Herbst";
    await syncCreativeSources(db.client, { sourceId: "s1" });
    expect(db.tables.creatives.find((c) => c.external_id === "b")).toMatchObject({ platforms: ["instagram"], campaign: "Herbst" });
  });

  it("recently read folders wait; a lost folder turns red with a clear message", async () => {
    db.tables.creative_sources[0].last_synced_at = new Date().toISOString();
    expect((await syncCreativeSources(db.client, { minIntervalMs: 600_000 })).synced).toBe(0);
    status = 404;
    await syncCreativeSources(db.client, { sourceId: "s1" });
    expect(db.tables.creative_sources[0]).toMatchObject({ status: "error", last_error: expect.stringMatching(/not found/i) });
    expect(db.tables.creatives).toEqual([]);
  });

  it("throttling only waits; an expired grant asks to connect again", async () => {
    status = 429;
    await syncCreativeSources(db.client, {});
    expect(db.tables.creative_sources[0].status).toBe("active");
    expect(Date.parse(db.tables.creative_sources[0].config.retryAt)).toBeGreaterThan(Date.now());
    db.tables.creative_sources[0].config = {};
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await syncCreativeSources(db.client, {});
    expect(db.tables.creative_sources[0]).toMatchObject({ status: "error", last_error: expect.stringMatching(/connect the folder again/i) });
  });
});
