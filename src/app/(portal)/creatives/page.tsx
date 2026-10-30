import { CreativesView } from "@/components/creatives/creatives-view";
import { getAuthUser, isStaff } from "@/lib/auth";
import { activeClientRef } from "@/lib/active-client-server";
import { creativeProvidersReady } from "@/lib/creative-sources";
import { loadCreativesLibrary } from "@/lib/creatives-server";
import { getClientByRef, listClients } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SOURCE_RESULTS = ["connected", "denied", "failed", "bad_link", "not_found", "access", "not_folder", "api_off", "missing_scope", "not_configured", "forbidden", "rate"];

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

  const lib = await loadCreativesLibrary(admin, clientId);
  if (lib.missing) return <CreativesView unavailable {...base} {...empty} />;
  // Open where the link points, else the project with the most recent creative.
  const folder = lib.folders.find((f) => f.id === searchParams.folder) ?? null;
  const projectId = folder?.project_id ?? lib.projects.find((x) => x.id === searchParams.project)?.id ?? lib.creatives[0]?.project_id ?? lib.projects[0]?.id ?? null;

  return (
    <CreativesView
      unavailable={false}
      {...base}
      limit={lib.limit}
      projects={lib.projects}
      folders={lib.folders}
      creatives={lib.creatives}
      sources={lib.sources}
      projectId={projectId}
      folderId={folder?.id ?? null}
      campaigns={lib.campaigns}
      tagsReady={lib.tagsReady}
      truncated={lib.truncated}
    />
  );
}
