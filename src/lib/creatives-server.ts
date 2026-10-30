import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { inBackground } from "@/lib/background";
import {
  describeFolder,
  exchangeCreativeCode,
  SourceError,
  syncCreativeSources,
} from "@/lib/creative-sources";
import { missingCreatives, type Creative, type CreativeFolder, type CreativeSourceProvider, type CreativeSourceView } from "@/lib/creatives";

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getFolder(admin: SupabaseClient, id: unknown): Promise<CreativeFolder | null> {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  const { data } = await admin.from("creative_folders").select("id,client_id,project_id,name,position").eq("id", id).maybeSingle();
  return (data as CreativeFolder | null) ?? null;
}

export function sourceView(s: any, files = 0): CreativeSourceView {
  return {
    id: s.id,
    folder_id: s.folder_id,
    project_id: s.project_id,
    provider: s.provider,
    label: s.label,
    account: s.account ?? null,
    status: s.status,
    last_error: s.last_error ?? null,
    last_synced_at: s.last_synced_at ?? null,
    files,
  };
}

/** Where the connect flow lands: the Creatives page on that partner and category. */
export async function creativesBackUrl(admin: SupabaseClient | null, origin: string, folder: Pick<CreativeFolder, "client_id" | "project_id" | "id"> | null, q: string) {
  const params = new URLSearchParams();
  if (folder && admin) {
    const { data: c } = await admin.from("clients").select("slug").eq("id", folder.client_id).maybeSingle();
    if (c?.slug) params.set("client", c.slug);
    params.set("project", folder.project_id);
    params.set("folder", folder.id);
  }
  const base = params.toString();
  return `${origin}/creatives?${base}${base ? "&" : ""}${q}`;
}

/**
 * Finish "Connect folder" after the provider sign-in: check the folder can be
 * read, store the source (reconnecting keeps it), and read it in the background.
 * Returns the result code for the page (`source=<code>`).
 */
export async function completeCreativeConnect(
  admin: SupabaseClient,
  args: { provider: CreativeSourceProvider; folder: CreativeFolder; link: string; code: string; origin: string; userId: string },
): Promise<string> {
  let tok: Awaited<ReturnType<typeof exchangeCreativeCode>>;
  try {
    tok = await exchangeCreativeCode(args.provider, args.code, args.origin);
  } catch (e) {
    return e instanceof SourceError && e.message === "missing_scope" ? "missing_scope" : "failed";
  }
  let info: Awaited<ReturnType<typeof describeFolder>>;
  try {
    info = await describeFolder(args.provider, tok.accessToken, args.link);
  } catch (e) {
    const code = e instanceof SourceError ? e.code : "failed";
    return code === "auth" ? "failed" : code;
  }
  const { data: saved, error } = await admin
    .from("creative_sources")
    .upsert(
      {
        client_id: args.folder.client_id,
        project_id: args.folder.project_id,
        folder_id: args.folder.id,
        provider: args.provider,
        external_id: info.externalId,
        label: info.name.slice(0, 200) || "Folder",
        account: info.account?.slice(0, 320) ?? null,
        access_token: tok.refreshToken,
        status: "active",
        last_error: null,
        created_by: args.userId,
        config: { accessToken: tok.accessToken, accessExp: Date.now() + tok.expiresIn * 1000 },
      },
      { onConflict: "folder_id,provider,external_id" },
    )
    .select("id")
    .single();
  if (error || !saved) return "failed";
  inBackground("creatives-first-sync", () => syncCreativeSources(admin, { sourceId: saved.id }));
  return "connected";
}

// ---- One partner's library (the web page and the mobile app read the same) ----

const COLS = "id,client_id,project_id,folder_id,source,source_id,name,kind,mime,size_bytes,width,height,duration_sec,external_url,content_hash,created_at,added_at";
const TAG_COLS = `${COLS},platforms,campaign`;
const PREVIEW_COLS = `${TAG_COLS},storage_path,thumb_path,preview_path`;
export const MAX_ROWS = 5000;

/** Campaigns already on creatives first, then names from leads (ids and numbers left out). */
export function campaignNames(creatives: Creative[], leads: { campaign: string }[]) {
  const names = new Set<string>();
  for (const c of creatives) if (c.campaign) names.add(c.campaign);
  for (const l of leads) {
    const n = l.campaign?.trim();
    if (n && n.length <= 200 && !/^\d+$/.test(n) && !/^[0-9a-f-]{20,}$/i.test(n)) names.add(n);
    if (names.size >= 200) break;
  }
  return Array.from(names);
}

export interface CreativesLibrary {
  missing: boolean;
  limit: number | null;
  projects: { id: string; name: string; status: string }[];
  folders: CreativeFolder[];
  creatives: Creative[];
  sources: CreativeSourceView[];
  campaigns: string[];
  tagsReady: boolean;
  truncated: boolean;
  /** How long the reads and the link signing took (for Server-Timing). */
  timing: { data: number; sign: number };
}

/** How long pre-signed thumbnail links stay valid (pages and the app fall back to the file route after). */
export const THUMB_LINK_SEC = 2 * 3600;
const SMALL_IMAGE = 400 * 1024;

/**
 * Signed links for every stored thumbnail in one batch per 1,000 files, so
 * grids load images straight from storage instead of one server request per
 * tile. Photos without a made thumbnail use the original while it is small;
 * HEIC, videos and PDFs without one get none (the page shows an icon or makes it).
 */
async function signThumbs(admin: SupabaseClient, rows: (Creative & { storage_path?: string | null })[]) {
  const want = new Map<string, string>(); // creative id → storage path
  for (const c of rows) {
    if (c.thumb_path) want.set(c.id, c.thumb_path);
    else if (c.storage_path && c.kind === "image" && !/\.(heic|heif)$/i.test(c.name) && (c.size_bytes ?? 0) <= SMALL_IMAGE) want.set(c.id, c.storage_path);
  }
  const entries = Array.from(want.entries());
  const urls = new Map<string, string>();
  await Promise.all(
    Array.from({ length: Math.ceil(entries.length / 1000) }, async (_, i) => {
      const chunk = entries.slice(i * 1000, i * 1000 + 1000);
      const { data } = await admin.storage.from("creatives").createSignedUrls(chunk.map(([, p]) => p), THUMB_LINK_SEC);
      (data ?? []).forEach((d, j) => d.signedUrl && !d.error && urls.set(chunk[j][0], d.signedUrl));
    }),
  );
  return urls;
}

/** Everything about one partner's creatives (newest 5,000). Works before migrations 0049/0050. */
export async function loadCreativesLibrary(admin: SupabaseClient, clientId: string, opts: { campaigns?: boolean } = {}): Promise<CreativesLibrary> {
  const t0 = Date.now();
  const loadCreatives = async (cols: string) => {
    const out: Creative[] = [];
    for (let from = 0; from < MAX_ROWS; from += 1000) {
      const { data, error } = await admin.from("creatives").select(cols).eq("client_id", clientId).order("created_at", { ascending: false }).range(from, from + 999);
      if (error) return { data: out, error };
      // Callers only need to know a file is stored with us, not where.
      out.push(...((data ?? []) as unknown as (Creative & { storage_path?: string | null })[]));
      if ((data ?? []).length < 1000) break;
    }
    return { data: out, error: null };
  };
  const [clientRes, projectsRes, foldersRes, full, sourcesRes, leadCampaigns] = await Promise.all([
    admin.from("clients").select("creatives_monthly_limit").eq("id", clientId).maybeSingle(),
    admin.from("projects").select("id,name,status,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
    admin.from("creative_folders").select("id,client_id,project_id,name,position").eq("client_id", clientId).order("position"),
    loadCreatives(PREVIEW_COLS),
    admin.from("creative_sources").select("id,folder_id,project_id,provider,label,account,status,last_error,last_synced_at").eq("client_id", clientId).order("created_at"),
    // Campaign names the partner's leads came from: suggestions when tagging.
    // Only the team tags creatives, so only the team needs them.
    opts.campaigns
      ? admin.from("leads").select("campaign").eq("client_id", clientId).not("campaign", "is", null).order("created_at", { ascending: false }).limit(2000)
      : Promise.resolve({ data: [] as { campaign: string }[] }),
  ]);
  // Before 0050 (previews) or 0049 (tags) those columns don't exist: load without them.
  const tagged = full.error ? await loadCreatives(`${TAG_COLS},storage_path`) : null;
  const tagsReady = !full.error || !tagged?.error;
  const res = !full.error ? full : !tagged?.error ? tagged! : await loadCreatives(`${COLS},storage_path`);
  const err = foldersRes.error ?? res.error;
  const raw = (res.data ?? []) as (Creative & { storage_path?: string | null })[];
  const t1 = Date.now();
  const thumbs = await signThumbs(admin, raw);
  const t2 = Date.now();
  // Callers only need to know a file is stored with us, not where.
  const creatives: Creative[] = raw.map(({ storage_path, ...c }) => ({ ...c, stored: !!storage_path, thumb_url: thumbs.get(c.id) ?? null }));
  const perSource = new Map<string, number>();
  for (const c of creatives) if (c.source_id) perSource.set(c.source_id, (perSource.get(c.source_id) ?? 0) + 1);
  return {
    missing: !!err && missingCreatives(err.message),
    limit: (clientRes.data?.creatives_monthly_limit as number | null) ?? null,
    projects: ((projectsRes.data ?? []) as { id: string; name: string; status: string }[]).map(({ id, name, status }) => ({ id, name, status })),
    folders: (foldersRes.data ?? []) as CreativeFolder[],
    creatives,
    sources: ((sourcesRes.data ?? []) as any[]).map((s) => sourceView(s, perSource.get(s.id) ?? 0)),
    campaigns: campaignNames(creatives, (leadCampaigns.data ?? []) as { campaign: string }[]),
    tagsReady,
    truncated: creatives.length >= MAX_ROWS,
    timing: { data: t1 - t0, sign: t2 - t1 },
  };
}
