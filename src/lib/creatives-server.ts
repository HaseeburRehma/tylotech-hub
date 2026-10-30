import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { inBackground } from "@/lib/background";
import {
  describeFolder,
  exchangeCreativeCode,
  SourceError,
  syncCreativeSources,
} from "@/lib/creative-sources";
import type { CreativeFolder, CreativeSourceProvider, CreativeSourceView } from "@/lib/creatives";

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
