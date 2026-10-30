import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test-fake-db";
import { ADMIN_USER, CLIENT_USER, OTHER_CLIENT_USER, STAFF_USER } from "@/test-utils";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // partner A (CLIENT_USER's company)
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // partner B
const PA = "11111111-1111-4111-8111-111111111111";
const PB = "22222222-2222-4222-8222-222222222222";
const FA = "33333333-3333-4333-8333-333333333333";
const FA2 = "34343434-3434-4343-8343-343434343434";
const FB = "44444444-4444-4444-8444-444444444444";
const U = "55555555-5555-4555-8555-555555555555";
const UP = "66666666-6666-4666-8666-666666666666";
const DRV = "77777777-7777-4777-8777-777777777777";
const CB = "88888888-8888-4888-8888-888888888888";

let user: any = null;
let db: ReturnType<typeof fakeDb>;
let limited = false;

vi.mock("@/lib/auth", () => ({ getAuthUser: async () => user, isStaff: (u: any) => u?.role === "admin" || u?.role === "team" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.client }));
// RLS: partners read only their own rows.
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ from: (t: string) => (user?.role === "client" ? db.client.from(t).select().eq("client_id", user.client_id) : db.client.from(t)) }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/background", () => ({ inBackground: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ getRateLimiter: () => ({ limit: async () => ({ success: !limited }) }), ipKey: () => "ip" }));
const cloud = vi.fn();
vi.mock("@/lib/creative-sources", async () => ({ ...(await vi.importActual<any>("@/lib/creative-sources")), cloudFileResponse: (...a: unknown[]) => cloud(...a) }));
const nonce = { value: "n1" as string | undefined, set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => (nonce.value ? { value: nonce.value } : undefined), set: nonce.set, delete: vi.fn() }) }));

import * as files from "./route";
import * as upload from "./upload/route";
import * as file from "./[id]/file/route";
import * as folders from "./folders/route";
import * as limit from "./limit/route";
import * as sources from "./sources/route";
import * as sourceOne from "./sources/[id]/route";
import * as callback from "./sources/callback/route";
import * as thumbRoute from "./[id]/thumb/route";
import { signCreativeLink } from "@/lib/creative-links";

const req = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://www.tylohq.de${url}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
const clientA = { ...CLIENT_USER, client_id: A };
const clientB = { ...OTHER_CLIENT_USER, client_id: B };
const pathA = `${A}/${PA}/${FA}/${U}-Banner.png`;

beforeEach(() => {
  limited = false;
  cloud.mockReset();
  nonce.value = "n1";
  nonce.set.mockReset();
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gs";
  db = fakeDb(
    {
      clients: [
        { id: A, slug: "partner-a", creatives_monthly_limit: null },
        { id: B, slug: "partner-b", creatives_monthly_limit: null },
      ],
      projects: [
        { id: PA, client_id: A, name: "Launch" },
        { id: PB, client_id: B, name: "Other" },
      ],
      creative_folders: [
        { id: FA, client_id: A, project_id: PA, name: "Ad Creatives", position: 0 },
        { id: FA2, client_id: A, project_id: PA, name: "Social Media Design", position: 1 },
        { id: FB, client_id: B, project_id: PB, name: "Ad Creatives", position: 0 },
      ],
      creatives: [
        { id: UP, client_id: A, project_id: PA, folder_id: FA, source: "upload", storage_path: pathA, name: "Banner.png", kind: "image", mime: "image/png" },
        { id: DRV, client_id: A, project_id: PA, folder_id: FA, source: "google_drive", source_id: "s1", external_id: "d1", name: "Reel.mp4", kind: "video", mime: "video/mp4" },
        { id: CB, client_id: B, project_id: PB, folder_id: FB, source: "upload", storage_path: `${B}/${PB}/${FB}/${U}-Secret.png`, name: "Secret.png", kind: "image" },
      ],
      creative_sources: [{ id: "s1", client_id: A, project_id: PA, folder_id: FA, provider: "google_drive", external_id: "ROOT", label: "Drive", access_token: "r", status: "active", config: {} }],
    },
    { unique: { creative_folders: [["project_id", "name"]] } },
  );
  user = STAFF_USER;
});

describe("upload (two steps, team only)", () => {
  it("nobody but the team gets upload links", async () => {
    user = null;
    expect((await upload.POST(req("/api/creatives/upload", "POST", { folderId: FA, files: [{ name: "a.png", size: 1 }] }))).status).toBe(401);
    user = clientA;
    expect((await upload.POST(req("/api/creatives/upload", "POST", { folderId: FA, files: [{ name: "a.png", size: 1 }] }))).status).toBe(403);
    expect(db.signedUploads).toEqual([]);
  });

  it("links point into the category's own folder; bad types and sizes are refused per file", async () => {
    const r = await json(
      await upload.POST(
        req("/api/creatives/upload", "POST", {
          folderId: FA,
          files: [
            { name: "../../Größe.PNG", size: 10 },
            { name: "x.svg", size: 10 },
            { name: "big.mp4", size: 600 * 1024 * 1024 },
            { name: "zero.jpg", size: 0 },
          ],
        }),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.files[0].path).toMatch(new RegExp(`^${A}/${PA}/${FA}/[0-9a-f-]{36}-Grosse.PNG$`));
    expect(r.body.files[0].contentType).toBe("image/png");
    expect(r.body.files.slice(1).map((f: any) => f.error)).toEqual(["type", "size", "size"]);
    expect((await upload.POST(req("/api/creatives/upload", "POST", { folderId: FA, files: Array(51).fill({ name: "a.png", size: 1 }) }))).status).toBe(400);
    expect((await upload.POST(req("/api/creatives/upload", "POST", { folderId: "nope", files: [{ name: "a.png", size: 1 }] }))).status).toBe(404);
    limited = true;
    expect((await upload.POST(req("/api/creatives/upload", "POST", { folderId: FA, files: [{ name: "a.png", size: 1 }] }))).status).toBe(429);
  });

  it("many team members uploading at once get distinct paths", async () => {
    const all = await Promise.all(Array.from({ length: 40 }, () => upload.POST(req("/api/creatives/upload", "POST", { folderId: FA, files: [{ name: "Same.png", size: 5 }] })).then(json)));
    const paths = all.map((r) => r.body.files[0].path);
    expect(new Set(paths).size).toBe(40);
  });

  it("confirm records only paths we issued that really reached storage, with storage's size", async () => {
    const good = `${A}/${PA}/${FA2}/${U}-Post.jpg`;
    db.objects.set(good, { size: 4242, mimetype: "image/jpeg" });
    const forged = `${B}/${PA}/${FA2}/${U}-x.jpg`; // other partner in the path
    const crossed = `${A}/${PA}/${FB}/${U}-y.jpg`; // other partner's category
    db.objects.set(forged, { size: 1, mimetype: "image/jpeg" });
    db.objects.set(crossed, { size: 1, mimetype: "image/jpeg" });
    const r = await json(
      await files.POST(
        req("/api/creatives", "POST", {
          items: [
            { path: good, name: "Post.jpg", hash: "sha256:" + "a".repeat(64), width: 1080, height: 1080, createdAt: "2999-01-01T00:00:00Z" },
            { path: forged, name: "x.jpg" },
            { path: crossed, name: "y.jpg" },
            { path: `${A}/${PA}/${FA2}/${U}-missing.jpg`, name: "missing.jpg" },
            { path: "../../etc/passwd", name: "p" },
          ],
        }),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.failed).toEqual(["x.jpg", "y.jpg", "missing.jpg", "p"]);
    const row = db.tables.creatives.find((c) => c.storage_path === good)!;
    expect(row).toMatchObject({ client_id: A, folder_id: FA2, kind: "image", size_bytes: 4242, width: 1080, uploaded_by: STAFF_USER.id });
    expect(Date.parse(row.created_at)).toBeLessThanOrEqual(Date.now());
    // Confirming twice doesn't duplicate.
    await files.POST(req("/api/creatives", "POST", { items: [{ path: good, name: "Post.jpg" }] }));
    expect(db.tables.creatives.filter((c) => c.storage_path === good)).toHaveLength(1);
    user = clientA;
    expect((await files.POST(req("/api/creatives", "POST", { items: [{ path: good }] }))).status).toBe(403);
  });
});

describe("previews and downloads", () => {
  it("partners only reach their own files", async () => {
    user = clientB;
    expect((await file.GET(req(`/api/creatives/${UP}/file`), { params: { id: UP } })).status).toBe(404);
    user = null;
    expect((await file.GET(req(`/api/creatives/${UP}/file`), { params: { id: UP } })).status).toBe(401);
    user = clientA;
    const r = await file.GET(req(`/api/creatives/${UP}/file?download=1`), { params: { id: UP } });
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(`https://store.example/${pathA}?ttl=300&download=1`);
  });

  it("a row pointing at another partner's storage is never signed", async () => {
    db.tables.creatives[0].storage_path = `${B}/${PB}/${FB}/${U}-Secret.png`;
    expect((await file.GET(req(`/api/creatives/${UP}/file`), { params: { id: UP } })).status).toBe(404);
  });

  it("Drive files stream with Range and a safe type; anything else downloads, sandboxed", async () => {
    cloud.mockResolvedValue({ response: new Response("partial", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-6/100" } }) });
    let r = await file.GET(req(`/api/creatives/${DRV}/file`, "GET", undefined, { range: "bytes=0-6" }), { params: { id: DRV } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-type")).toBe("video/mp4");
    expect(r.headers.get("content-range")).toBe("bytes 0-6/100");
    expect(cloud.mock.calls[0][3]).toMatchObject({ range: "bytes=0-6" });
    db.tables.creatives[1].mime = "text/html";
    cloud.mockResolvedValue({ response: new Response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } }) });
    r = await file.GET(req(`/api/creatives/${DRV}/file`), { params: { id: DRV } });
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(r.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    cloud.mockResolvedValue({ redirect: "javascript:alert(1)" });
    expect((await file.GET(req(`/api/creatives/${DRV}/file`), { params: { id: DRV } })).status).toBe(502);
  });

  it("a source of another partner can't be used to read files", async () => {
    db.tables.creative_sources[0].client_id = B;
    expect((await file.GET(req(`/api/creatives/${DRV}/file`), { params: { id: DRV } })).status).toBe(404);
    expect(cloud).not.toHaveBeenCalled();
  });
});

describe("move, rename, delete (team only)", () => {
  it("partners can't change anything", async () => {
    user = clientA;
    expect((await files.DELETE(req("/api/creatives", "DELETE", { ids: [UP] }))).status).toBe(403);
    expect((await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP], folderId: FA2 }))).status).toBe(403);
    expect(db.tables.creatives).toHaveLength(3);
  });

  it("uploads move within the partner; never to another partner; synced files stay", async () => {
    expect((await json(await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP, DRV], folderId: FA2 })))).body).toMatchObject({ moved: 1, skipped: 1 });
    expect(db.tables.creatives.find((c) => c.id === UP)!.folder_id).toBe(FA2);
    expect((await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP], folderId: FB }))).status).toBe(400);
    expect((await files.PATCH(req("/api/creatives", "PATCH", { id: UP, name: "  " }))).status).toBe(400);
    await files.PATCH(req("/api/creatives", "PATCH", { id: UP, name: "a/b/Final.png" }));
    expect(db.tables.creatives.find((c) => c.id === UP)!.name).toBe("Final.png");
  });

  it("delete removes the upload and its stored file; synced files are left alone", async () => {
    db.objects.set(pathA, { size: 1, mimetype: "image/png" });
    expect((await json(await files.DELETE(req("/api/creatives", "DELETE", { ids: [UP, DRV, "not-a-uuid"] })))).body).toMatchObject({ deleted: 1, skipped: 1 });
    expect(db.removed).toEqual([pathA, `${A}/thumbs/${UP}.jpg`, `${A}/previews/${UP}.jpg`]);
    expect(db.tables.creatives.map((c) => c.id).sort()).toEqual([DRV, CB]);
    expect((await files.DELETE(req("/api/creatives", "DELETE", { ids: [DRV] }))).status).toBe(400);
  });
});

describe("platform and campaign tags (team only)", () => {
  it("partners can't tag; unknown platforms and other partners' files are refused", async () => {
    user = clientA;
    expect((await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP], platforms: ["instagram"] }))).status).toBe(403);
    user = STAFF_USER;
    expect((await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP], platforms: ["instagram", "<script>"] }))).status).toBe(400);
    expect((await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP], campaign: 5 }))).status).toBe(400);
    expect((await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP, CB], campaign: "Mix" }))).status).toBe(400);
    expect(db.tables.creatives.find((c) => c.id === CB)!.campaign).toBeUndefined();
  });

  it("tags uploads and synced files alike; empty campaign clears it", async () => {
    const r = await json(await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP, DRV], platforms: ["instagram", "facebook"], campaign: "  Herbst\n2026 " })));
    expect(r.body).toMatchObject({ ok: true, tagged: 2 });
    for (const id of [UP, DRV]) expect(db.tables.creatives.find((c) => c.id === id)).toMatchObject({ platforms: ["instagram", "facebook"], campaign: "Herbst 2026" });
    await files.PATCH(req("/api/creatives", "PATCH", { ids: [UP], campaign: "" }));
    expect(db.tables.creatives.find((c) => c.id === UP)!.campaign).toBeNull();
    expect(db.tables.creatives.find((c) => c.id === UP)!.platforms).toEqual(["instagram", "facebook"]);
  });

  it("uploads carry their tags; bad tags are dropped, not stored", async () => {
    const path = `${A}/${PA}/${FA}/${U}-Story.png`;
    db.objects.set(path, { size: 10, mimetype: "image/png" });
    await files.POST(req("/api/creatives", "POST", { items: [{ path, name: "Story.png", platforms: ["tiktok"], campaign: "Reels" }] }));
    expect(db.tables.creatives.find((c) => c.storage_path === path)).toMatchObject({ platforms: ["tiktok"], campaign: "Reels" });
    const path2 = `${A}/${PA}/${FA}/${U}-Story2.png`;
    db.objects.set(path2, { size: 10, mimetype: "image/png" });
    await files.POST(req("/api/creatives", "POST", { items: [{ path: path2, name: "Story2.png", platforms: ["evil"], campaign: { $ne: 1 } }] }));
    expect(db.tables.creatives.find((c) => c.storage_path === path2)).toMatchObject({ platforms: [], campaign: null });
  });
});

describe("categories and monthly limit (team only)", () => {
  it("add, rename, refuse duplicates, remove only when empty", async () => {
    user = clientA;
    expect((await folders.POST(req("/api/creatives/folders", "POST", { projectId: PA, name: "Stories" }))).status).toBe(403);
    user = ADMIN_USER;
    const r = await json(await folders.POST(req("/api/creatives/folders", "POST", { projectId: PA, name: "  Stories\n& Reels  " })));
    expect(r.body.folder).toMatchObject({ client_id: A, project_id: PA, name: "Stories & Reels", position: 2 });
    expect((await folders.POST(req("/api/creatives/folders", "POST", { projectId: PA, name: "ad creatives" }))).status).toBe(409);
    expect((await folders.PATCH(req("/api/creatives/folders", "PATCH", { id: FA2, name: "Ad Creatives" }))).status).toBe(409);
    expect((await folders.DELETE(req("/api/creatives/folders", "DELETE", { id: FA }))).status).toBe(409);
    expect((await folders.DELETE(req("/api/creatives/folders", "DELETE", { id: FA2 }))).status).toBe(200);
    expect((await folders.POST(req("/api/creatives/folders", "POST", { projectId: "' or 1=1", name: "x" }))).status).toBe(404);
  });

  it("limit is a whole number or nothing", async () => {
    for (const bad of [0, -5, 1.5, "abc", 100001]) expect((await limit.PATCH(req("/api/creatives/limit", "PATCH", { clientId: A, limit: bad }))).status).toBe(400);
    expect((await limit.PATCH(req("/api/creatives/limit", "PATCH", { clientId: A, limit: 300 }))).status).toBe(200);
    expect(db.tables.clients[0].creatives_monthly_limit).toBe(300);
    await limit.PATCH(req("/api/creatives/limit", "PATCH", { clientId: A, limit: null }));
    expect(db.tables.clients[0].creatives_monthly_limit).toBeNull();
    user = clientA;
    expect((await limit.PATCH(req("/api/creatives/limit", "PATCH", { clientId: A, limit: 99999 }))).status).toBe(403);
  });
});

describe("connecting cloud folders (team only)", () => {
  it("starts a read-only Google sign-in bound to this browser", async () => {
    const r = await sources.GET(req(`/api/creatives/sources?folderId=${FA}&provider=google_drive&link=${encodeURIComponent("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv")}`));
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin).toBe("https://accounts.google.com");
    expect(loc.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.readonly");
    const state = JSON.parse(Buffer.from(loc.searchParams.get("state")!, "base64url").toString());
    expect(state).toMatchObject({ provider: "creative_source", p: "google_drive", clientId: A, folderId: FA, link: "1AbCdEfGhIjKlMnOpQrStUv" });
    expect(nonce.set).toHaveBeenCalledWith("oauth_nonce", state.nonce, expect.objectContaining({ httpOnly: true, path: "/api/integrations" }));
  });

  it("refuses partners, bad links and services that aren't set up", async () => {
    const go = async (q: string) => new URL((await sources.GET(req(`/api/creatives/sources?${q}`))).headers.get("location")!).searchParams.get("source");
    user = clientB;
    const r = await sources.GET(req(`/api/creatives/sources?folderId=${FA}&provider=google_drive&link=1AbCdEfGhIjKlMnOpQrStUv`));
    // A partner learns nothing about the folder it named (no other partner's page or ids).
    expect(r.headers.get("location")).toBe("https://www.tylohq.de/creatives?source=forbidden");
    user = STAFF_USER;
    expect(await go(`folderId=${FA}&provider=dropbox&link=${encodeURIComponent("https://dropbox.com.evil.io/x")}`)).toBe("bad_link");
    delete process.env.DROPBOX_APP_KEY;
    expect(await go(`folderId=${FA}&provider=dropbox&link=/Creatives`)).toBe("not_configured");
    expect(await go(`folderId=${FA}&provider=ftp&link=x`)).toBe("failed");
    expect(nonce.set).not.toHaveBeenCalled();
  });

  it("a callback without this browser's nonce connects nothing", async () => {
    const state = Buffer.from(JSON.stringify({ provider: "creative_source", p: "dropbox", folderId: FA, link: "/x", nonce: "attacker" })).toString("base64url");
    const r = await callback.GET(req(`/api/creatives/sources/callback?code=c&state=${state}`));
    expect(new URL(r.headers.get("location")!).searchParams.get("source")).toBe("failed");
    expect(db.tables.creative_sources).toHaveLength(1);
  });

  it("sync and disconnect are team only; disconnect drops only that folder's files", async () => {
    user = clientA;
    expect((await sourceOne.DELETE(req("/api/creatives/sources/s1", "DELETE"), { params: { id: "s1" } })).status).toBe(403);
    user = STAFF_USER;
    expect((await sourceOne.POST(req("/api/creatives/sources/x", "POST", { action: "sync" }), { params: { id: "not-uuid" } })).status).toBe(404);
  });
});

describe("thumbnails, previews and signed links", () => {
  it("only the team stores thumbnails, always at the creative's own path", async () => {
    user = clientA;
    expect((await thumbRoute.POST(req(`/api/creatives/${UP}/thumb`, "POST", { what: "thumb" }), { params: { id: UP } })).status).toBe(403);
    user = STAFF_USER;
    expect((await thumbRoute.POST(req(`/api/creatives/${UP}/thumb`, "POST", { what: "../../x" }), { params: { id: UP } })).status).toBe(404);
    const r = await json(await thumbRoute.POST(req(`/api/creatives/${UP}/thumb`, "POST", { what: "thumb" }), { params: { id: UP } }));
    expect(r.body.path).toBe(`${A}/thumbs/${UP}.jpg`);
    expect((await thumbRoute.PUT(req(`/api/creatives/${UP}/thumb`, "PUT", { what: "thumb" }), { params: { id: UP } })).status).toBe(400); // nothing stored yet
    // Something other than a JPEG at the thumbnail path is refused and removed.
    db.objects.set(`${A}/thumbs/${UP}.jpg`, { size: 20_000, mimetype: "video/mp4" });
    expect((await thumbRoute.PUT(req(`/api/creatives/${UP}/thumb`, "PUT", { what: "thumb" }), { params: { id: UP } })).status).toBe(415);
    expect(db.removed).toContain(`${A}/thumbs/${UP}.jpg`);
    db.objects.set(`${A}/thumbs/${UP}.jpg`, { size: 20_000, mimetype: "image/jpeg" });
    expect((await thumbRoute.PUT(req(`/api/creatives/${UP}/thumb`, "PUT", { what: "thumb" }), { params: { id: UP } })).status).toBe(200);
    expect(db.tables.creatives.find((c) => c.id === UP)!.thumb_path).toBe(`${A}/thumbs/${UP}.jpg`);
  });

  it("a made thumbnail is served from storage; one pointing elsewhere is ignored", async () => {
    user = clientA;
    db.tables.creatives.find((c) => c.id === UP)!.thumb_path = `${A}/thumbs/${UP}.jpg`;
    let r = await file.GET(req(`/api/creatives/${UP}/file?thumb=1`), { params: { id: UP } });
    expect(r.headers.get("location")).toContain(`${A}/thumbs/${UP}.jpg`);
    db.tables.creatives.find((c) => c.id === UP)!.thumb_path = `${B}/thumbs/${UP}.jpg`;
    r = await file.GET(req(`/api/creatives/${UP}/file?thumb=1`), { params: { id: UP } });
    expect(r.headers.get("location")).toContain(pathA);
  });

  it("the app gets links: storage links for stored files, our signed link for cloud files", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
    user = clientA;
    let r = await json(await file.GET(req(`/api/creatives/${UP}/file?json=1`), { params: { id: UP } }));
    expect(r.body.url).toContain(`https://store.example/${pathA}`);
    r = await json(await file.GET(req(`/api/creatives/${DRV}/file?json=1`), { params: { id: DRV } }));
    expect(r.body.url).toMatch(new RegExp(`/api/creatives/${DRV}/file\\?exp=\\d+&sig=`));
    // The signed link works without a session...
    user = null;
    cloud.mockResolvedValue({ response: new Response("bytes", { headers: { "content-type": "video/mp4" } }) });
    const path = new URL(r.body.url).pathname + new URL(r.body.url).search;
    expect((await file.GET(req(path), { params: { id: DRV } })).status).toBe(200);
    // ...but not for another creative, another variant, or once tampered with or expired.
    expect((await file.GET(req(path), { params: { id: UP } })).status).toBe(403);
    expect((await file.GET(req(`${path}&thumb=1`), { params: { id: DRV } })).status).toBe(403);
    expect((await file.GET(req(path.replace(/sig=./, "sig=X")), { params: { id: DRV } })).status).toBe(403);
    const old = signCreativeLink("https://www.tylohq.de", DRV, "file", Date.now() - 3600_000);
    expect((await file.GET(req(new URL(old).pathname + new URL(old).search), { params: { id: DRV } })).status).toBe(403);
    expect((await file.GET(req(`/api/creatives/${DRV}/file`), { params: { id: DRV } })).status).toBe(401);
  });
});

describe("list for the mobile app", () => {
  it("partners get only their own library; the team picks any partner", async () => {
    user = clientA;
    let r = await json(await files.GET(req(`/api/creatives?clientId=${B}`)));
    expect(r.status).toBe(200);
    expect(r.body.clientId).toBe(A);
    expect(r.body.clients).toBeUndefined();
    expect(r.body.campaigns).toBeUndefined();
    expect(r.body.creatives.map((c: any) => c.id).sort()).toEqual([UP, DRV].sort());
    expect(r.body.creatives.every((c: any) => !("storage_path" in c))).toBe(true);
    expect(r.body.creatives.find((c: any) => c.id === UP).stored).toBe(true);
    // Grid images come pre-signed (straight from storage), only for the partner's own stored files.
    expect(r.body.creatives.find((c: any) => c.id === UP).thumb_url).toBe(`https://store.example/${pathA}?ttl=7200`);
    expect(r.body.creatives.find((c: any) => c.id === DRV).thumb_url).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain(`${B}/`);
    expect(JSON.stringify(r.body)).not.toContain('"access_token"');
    user = STAFF_USER;
    r = await json(await files.GET(req(`/api/creatives?clientId=${B}`)));
    expect(r.body.clientId).toBe(B);
    expect(r.body.creatives.map((c: any) => c.id)).toEqual([CB]);
    expect(r.body.clients.map((c: any) => c.id).sort()).toEqual([A, B].sort());
    r = await json(await files.GET(req(`/api/creatives?clientId=not-a-partner`)));
    expect([A, B]).toContain(r.body.clientId);
    user = null;
    expect((await files.GET(req("/api/creatives"))).status).toBe(401);
  });
});
