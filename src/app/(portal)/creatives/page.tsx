import { CreativesView } from "@/components/creatives/creatives-view";
import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { creativeProvidersReady } from "@/lib/creative-sources";
import { missingCreatives, type Creative, type CreativeFolder } from "@/lib/creatives";
import { sourceView } from "@/lib/creatives-server";
import { getClientByRef, listClients } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLS = "id,client_id,project_id,folder_id,source,source_id,name,kind,mime,size_bytes,width,height,duration_sec,external_url,content_hash,created_at,added_at";
const TAG_COLS = `${COLS},platforms,campaign`;
const MAX_ROWS = 5000;
const SOURCE_RESULTS = ["connected", "denied", "failed", "bad_link", "not_found", "access", "not_folder", "api_off", "missing_scope", "not_configured", "forbidden", "rate"];

/** Campaigns already on creatives first, then names from leads (ids and numbers left out). */
function campaignNames(creatives: Creative[], leads: { campaign: string }[]) {
  const names = new Set<string>();
  for (const c of creatives) if (c.campaign) names.add(c.campaign);
  for (const l of leads) {
    const n = l.campaign?.trim();
    if (n && n.length <= 200 && !/^\d+$/.test(n) && !/^[0-9a-f-]{20,}$/i.test(n)) names.add(n);
    if (names.size >= 200) break;
  }
  return Array.from(names);
}

function berlinNow() {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(new Date()).split("-");
  return { year: Number(y), month: Number(m) };
}

export default async function CreativesPage({ searchParams }: { searchParams: { client?: string; project?: string; folder?: string; year?: string; source?: string } }) {
  // Filters (range, platform, campaign, type, source) are read in the browser from the URL.
  const user = await getAuthUser();
  const staff = isStaff(user);
  let clientId = user?.client_id ?? null;
  let company = user?.company ?? "";
  if (staff) {
    const ref = activeClientRef(searchParams.client);
    const picked = ref ? await getClientByRef(ref) : null;
    const [first] = (await listClients()).sort((a, b) => a.company.localeCompare(b.company));
    const c = picked ?? first ?? null;
    clientId = c?.id ?? null;
    company = c?.company ?? "";
  }
  const now = berlinNow();
  const askedYear = Number(searchParams.year);
  const year = Number.isInteger(askedYear) && askedYear >= now.year - 10 && askedYear <= now.year ? askedYear : now.year;
  const base = {
    clientId,
    company,
    staff,
    year,
    thisYear: now.year,
    thisMonth: now.month,
    ready: creativeProvidersReady(),
    flash: SOURCE_RESULTS.includes(searchParams.source ?? "") ? searchParams.source! : null,
  };
  const empty = { limit: null, projects: [], folders: [], creatives: [], sources: [], projectId: null, folderId: null, campaigns: [], tagsReady: false, truncated: false };

  const admin = createAdminClient();
  if (!admin || !clientId || !user) return <CreativesView unavailable={false} {...base} {...empty} />;

  const loadCreatives = async (cols: string) => {
    const out: Creative[] = [];
    for (let from = 0; from < MAX_ROWS; from += 1000) {
      const { data, error } = await admin.from("creatives").select(cols).eq("client_id", clientId).order("created_at", { ascending: false }).range(from, from + 999);
      if (error) return { data: out, error };
      out.push(...((data ?? []) as unknown as Creative[]));
      if ((data ?? []).length < 1000) break;
    }
    return { data: out, error: null };
  };
  const [clientRes, projectsRes, foldersRes, tagged, sourcesRes, leadCampaigns] = await Promise.all([
    admin.from("clients").select("creatives_monthly_limit").eq("id", clientId).maybeSingle(),
    admin.from("projects").select("id,name,status,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
    admin.from("creative_folders").select("id,client_id,project_id,name,position").eq("client_id", clientId).order("position"),
    loadCreatives(TAG_COLS),
    admin.from("creative_sources").select("id,folder_id,project_id,provider,label,account,status,last_error,last_synced_at").eq("client_id", clientId).order("created_at"),
    // Campaign names the partner's leads came from: suggestions when tagging.
    admin.from("leads").select("campaign").eq("client_id", clientId).not("campaign", "is", null).order("created_at", { ascending: false }).limit(2000),
  ]);
  // Before 0049_creative_tags.sql the tag columns don't exist: load without them.
  const tagsReady = !tagged.error;
  const creativesRes = tagsReady ? tagged : await loadCreatives(COLS);
  const err = foldersRes.error ?? creativesRes.error;
  if (err && missingCreatives(err.message)) return <CreativesView unavailable {...base} {...empty} />;

  const creatives = (creativesRes.data ?? []) as Creative[];
  const perSource = new Map<string, number>();
  for (const c of creatives) if (c.source_id) perSource.set(c.source_id, (perSource.get(c.source_id) ?? 0) + 1);
  const folders = (foldersRes.data ?? []) as CreativeFolder[];
  const projects = ((projectsRes.data ?? []) as { id: string; name: string; status: string }[]).map(({ id, name, status }) => ({ id, name, status }));
  // Open where the link points, else the project with the most recent creative.
  const folder = folders.find((f) => f.id === searchParams.folder) ?? null;
  const projectId = folder?.project_id ?? projects.find((x) => x.id === searchParams.project)?.id ?? creatives[0]?.project_id ?? projects[0]?.id ?? null;

  return (
    <CreativesView
      unavailable={false}
      {...base}
      limit={(clientRes.data?.creatives_monthly_limit as number | null) ?? null}
      projects={projects}
      folders={folders}
      creatives={creatives}
      sources={((sourcesRes.data ?? []) as any[]).map((s) => sourceView(s, perSource.get(s.id) ?? 0))}
      projectId={projectId}
      folderId={folder?.id ?? null}
      campaigns={campaignNames(creatives, (leadCampaigns.data ?? []) as { campaign: string }[])}
      tagsReady={tagsReady}
      truncated={creatives.length >= MAX_ROWS}
    />
  );
}
