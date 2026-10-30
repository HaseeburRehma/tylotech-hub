import { CreativesView } from "@/components/creatives/creatives-view";
import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { creativeProvidersReady } from "@/lib/creative-sources";
import { fillYear, missingCreatives, type Creative, type CreativeFolder } from "@/lib/creatives";
import { sourceView } from "@/lib/creatives-server";
import { getClientByRef, listClients } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLS = "id,client_id,project_id,folder_id,source,source_id,name,kind,mime,size_bytes,width,height,duration_sec,external_url,created_at,added_at";
const SOURCE_RESULTS = ["connected", "denied", "failed", "bad_link", "not_found", "access", "not_folder", "api_off", "missing_scope", "not_configured", "forbidden", "rate"];

function berlinNow() {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(new Date()).split("-");
  return { year: Number(y), month: Number(m) };
}

export default async function CreativesPage({ searchParams }: { searchParams: { client?: string; project?: string; folder?: string; year?: string; source?: string } }) {
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
  const empty = { limit: null, months: fillYear([]), projects: [], folders: [], counts: {}, creatives: [], sources: [], projectId: null, folderId: null };

  const admin = createAdminClient();
  if (!admin || !clientId || !user) return <CreativesView unavailable={false} {...base} {...empty} />;

  const [clientRes, projectsRes, foldersRes, creativesRes, sourcesRes, monthsRes, countsRes] = await Promise.all([
    admin.from("clients").select("creatives_monthly_limit").eq("id", clientId).maybeSingle(),
    admin.from("projects").select("id,name,status,created_at").eq("client_id", clientId).order("created_at", { ascending: false }),
    admin.from("creative_folders").select("id,client_id,project_id,name,position").eq("client_id", clientId).order("position"),
    admin.from("creatives").select(COLS).eq("client_id", clientId).order("created_at", { ascending: false }).limit(3000),
    admin.from("creative_sources").select("id,folder_id,project_id,provider,label,account,status,last_error,last_synced_at").eq("client_id", clientId).order("created_at"),
    admin.rpc("creatives_monthly", { p_client: clientId, p_year: year }),
    admin.rpc("creative_folder_counts", { p_client: clientId }),
  ]);
  const err = foldersRes.error ?? creativesRes.error ?? monthsRes.error;
  if (err && missingCreatives(err.message)) return <CreativesView unavailable {...base} {...empty} />;

  const creatives = (creativesRes.data ?? []) as Creative[];
  const counts: Record<string, number> = {};
  for (const r of (countsRes.data ?? []) as { folder_id: string; files: number }[]) counts[r.folder_id] = r.files;
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
      months={fillYear((monthsRes.data ?? []) as never[])}
      projects={projects}
      folders={folders}
      counts={counts}
      creatives={creatives}
      sources={((sourcesRes.data ?? []) as any[]).map((s) => sourceView(s, perSource.get(s.id) ?? 0))}
      projectId={projectId}
      folderId={folder?.id ?? null}
    />
  );
}
