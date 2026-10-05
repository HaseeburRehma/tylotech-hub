/**
 * Server-side data access layer. Import ONLY from server components / route handlers.
 * Reads through the RLS-scoped Supabase server client. Real data only — no mock
 * fallbacks. Callers render clean empty states when a list is empty.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatPeer, Client, DocItem, Kpi, Message, Project, Role, SeriesPoint, Update } from "@/types";

export interface TeamMember {
  id: string;
  name: string;
  role: string;
}

export interface TeamLoad {
  id: string;
  name: string;
  role: string;
  /** Projects in progress or in review assigned to this member. */
  activeProjects: number;
  /** Distinct clients across this member's unfinished projects. */
  clients: number;
  avatar: null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Founder / Strategy",
  team: "Account / Delivery",
};

function mapClient(c: any): Client {
  return {
    id: c.id,
    slug: c.slug ?? null,
    name: c.name,
    company: c.company,
    logo_url: c.logo_url,
    primary_color: c.primary_color,
    secondary_color: c.secondary_color,
    plan: c.plan,
    mrr: c.mrr ?? 0,
    themeId: "tylotech",
    created_at: c.created_at,
  };
}

export async function listClients(): Promise<Client[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb.from("clients").select("*").order("created_at", { ascending: true });
  return (data ?? []).map(mapClient);
}

export async function getClient(id: string): Promise<Client | null> {
  const sb = createClient();
  if (!sb) return null;
  const { data } = await sb.from("clients").select("*").eq("id", id).single();
  return data ? mapClient(data) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a client by a URL ref that may be a slug (clean links) OR a UUID
 * (legacy links, notification/search hrefs). Access control stays server-side —
 * the ref is just a lookup key, never the security boundary.
 */
export async function getClientByRef(ref: string): Promise<Client | null> {
  const sb = createClient();
  if (!sb || !ref) return null;
  const column = UUID_RE.test(ref) ? "id" : "slug";
  const { data } = await sb.from("clients").select("*").eq(column, ref).maybeSingle();
  return data ? mapClient(data) : null;
}

/**
 * Look up a client by slug using the admin client (no auth required).
 * Returns only the fields needed for branding — safe for public login pages.
 */
export async function getClientBySlugPublic(
  slug: string,
): Promise<{ id: string; company: string; slug: string; logo_url: string | null; primary_color: string; secondary_color: string; tagline?: string } | null> {
  const admin = createAdminClient();
  if (!admin || !slug) return null;
  const { data } = await admin
    .from("clients")
    .select("id,company,slug,logo_url,primary_color,secondary_color")
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

export interface ProviderSeriesPoint extends SeriesPoint {
  provider: string;
}

/** Raw per-provider daily rows (no combining) — lets a client component filter
 * by source instantly without a server round-trip per tab switch. */
export async function getSeriesByProvider(clientId: string | null): Promise<ProviderSeriesPoint[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("metric_points")
    .select("date,spend,leads,roas,provider")
    .eq("client_id", clientId)
    .order("date", { ascending: true });
  return (data ?? []).map((p: any) => ({
    date: p.date,
    spend: Number(p.spend),
    leads: Number(p.leads),
    roas: Number(p.roas),
    provider: p.provider,
  }));
}

export async function getKpis(clientId: string | null): Promise<Kpi[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("kpis")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Kpi[];
}

/**
 * Daily series for a client. Pass `provider` (e.g. "meta_ads", "search_console")
 * to get that source's own numbers untouched; omit it to get the combined paid
 * view — Meta + Google Ads only. GA4 and Search Console store users/clicks in the
 * `leads` column, so mixing them in would count website traffic as leads.
 */
export async function getSeries(clientId: string | null, provider?: string): Promise<SeriesPoint[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  let query = sb.from("metric_points").select("date,spend,leads,roas,provider").eq("client_id", clientId);
  query = provider ? query.eq("provider", provider) : query.in("provider", Array.from(AD_PROVIDERS));
  const { data } = await query.order("date", { ascending: true });
  const rows = data ?? [];

  if (provider) {
    return rows.map((p: any) => ({ date: p.date, spend: Number(p.spend), leads: Number(p.leads), roas: Number(p.roas) }));
  }

  const byDate = new Map<string, { spend: number; leads: number; value: number }>();
  for (const p of rows) {
    const cur = byDate.get(p.date) ?? { spend: 0, leads: 0, value: 0 };
    const spend = Number(p.spend);
    cur.spend += spend;
    cur.leads += Number(p.leads);
    cur.value += Number(p.roas) * spend; // purchase value → spend-weighted ROAS
    byDate.set(p.date, cur);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      spend: Number(v.spend.toFixed(2)),
      leads: v.leads,
      roas: v.spend ? Number((v.value / v.spend).toFixed(2)) : 0,
    }));
}

// Only Meta/Google Ads write real spend into the shared `spend`/`leads` columns —
// GA4 and Search Console repurpose those columns for their own daily metrics (see
// fetchers.ts). Agency-wide "ad spend under management" must stay scoped to these
// two providers, same guard as performance/view.tsx's combineSeries().
const AD_PROVIDERS = new Set(["meta_ads", "google_ads"]);

export interface PortfolioSummary {
  spend30d: number;
  /** null when the previous window isn't populated enough to compare against. */
  spendPrev30d: number | null;
  leads30d: number;
  leadsPrev30d: number | null;
  series: SeriesPoint[];
}

/**
 * Staff-only aggregate: real ad spend/leads across every client's Meta/Google Ads
 * accounts, last 30 days vs the 30 before that, plus a combined daily series for
 * the trend chart. Relies on RLS (`is_staff()`) to read across all tenants.
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const empty: PortfolioSummary = { spend30d: 0, spendPrev30d: 0, leads30d: 0, leadsPrev30d: 0, series: [] };
  const sb = createClient();
  if (!sb) return empty;

  // Two equal 30-day windows of complete days, ending yesterday.
  const day = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const end = day(1);
  const cutoffStr = day(30);
  const sinceStr = day(60);

  const { data } = await sb
    .from("metric_points")
    .select("date,spend,leads,provider")
    .in("provider", Array.from(AD_PROVIDERS))
    .gte("date", sinceStr)
    .lte("date", end)
    .order("date", { ascending: true });
  const rows = data ?? [];
  if (!rows.length) return empty;

  const byDate = new Map<string, { spend: number; leads: number }>();
  const prevDays = new Set<string>();
  let spend30d = 0, spendPrev30d = 0, leads30d = 0, leadsPrev30d = 0;
  for (const r of rows) {
    const spend = Number(r.spend);
    const leads = Number(r.leads);
    const cur = byDate.get(r.date) ?? { spend: 0, leads: 0 };
    cur.spend += spend;
    cur.leads += leads;
    byDate.set(r.date, cur);
    if (r.date >= cutoffStr) {
      spend30d += spend;
      leads30d += leads;
    } else {
      spendPrev30d += spend;
      leadsPrev30d += leads;
      prevDays.add(r.date);
    }
  }

  // Only compare against the previous window when it's actually populated —
  // a half-empty window (recently connected account) would fake huge growth.
  const prevComplete = prevDays.size >= 20;

  const series = Array.from(byDate.entries())
    .filter(([date]) => date >= cutoffStr)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, spend: Number(v.spend.toFixed(2)), leads: v.leads, roas: 0 }));

  return {
    spend30d: Number(spend30d.toFixed(2)),
    spendPrev30d: prevComplete ? Number(spendPrev30d.toFixed(2)) : null,
    leads30d,
    leadsPrev30d: prevComplete ? leadsPrev30d : null,
    series,
  };
}

export interface IntegrationHealthRow {
  clientId: string;
  clientName: string;
  clientSlug: string | null;
  provider: string;
  status: string;
  lastSyncedAt: string | null;
}

/**
 * Staff-only: integrations that were connected and synced at least once but are
 * now disconnected/erroring — i.e. real regressions worth a look, not the noise
 * of providers a client simply never set up.
 */
export async function listIntegrationHealth(): Promise<IntegrationHealthRow[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data: rows } = await admin
    .from("integrations")
    .select("client_id,provider,status,last_synced_at")
    .neq("status", "connected");
  const actionable = (rows ?? []).filter((r: any) => r.status === "error" || r.last_synced_at);
  if (!actionable.length) return [];

  const clients = await listClients();
  const byId = new Map(clients.map((c) => [c.id, c]));
  return actionable
    .map((r: any) => {
      const c = byId.get(r.client_id);
      return {
        clientId: r.client_id,
        clientName: c?.company ?? "—",
        clientSlug: c?.slug ?? null,
        provider: r.provider as string,
        status: r.status as string,
        lastSyncedAt: r.last_synced_at as string | null,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/** Staff-only cross-tenant updates feed, newest first, with the client name attached. */
export async function listUpdatesAll(limit = 8): Promise<(Update & { clientName: string })[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb
    .from("updates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  if (!rows.length) return [];

  const clientIds = Array.from(new Set(rows.map((u: any) => u.client_id)));
  const { data: clients } = await sb.from("clients").select("id,company").in("id", clientIds);
  const nameById = new Map((clients ?? []).map((c: any) => [c.id, c.company]));
  return (rows as Update[]).map((u) => ({ ...u, clientName: nameById.get(u.client_id) ?? "—" }));
}

export async function listProjects(clientId?: string | null): Promise<Project[]> {
  const sb = createClient();
  if (!sb) return [];
  let q = sb.from("projects").select("*").order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  return (data ?? []) as Project[];
}

export async function listUpdates(clientId: string | null): Promise<Update[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("updates")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Update[];
}

export async function listDocuments(clientId: string | null): Promise<DocItem[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("documents")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data ?? []) as DocItem[];
}

function mapMsg(m: any): Message {
  return {
    id: m.id,
    client_id: m.client_id,
    sender_id: m.sender_id,
    sender_name: m.sender_name ?? "TyloTech",
    sender_role: (m.sender_role ?? "team") as Role,
    recipient_id: m.recipient_id ?? null,
    parent_id: m.parent_id ?? null,
    reply_count: m.reply_count ?? 0,
    last_reply_at: m.last_reply_at ?? null,
    content: m.content ?? "",
    content_translated: m.content_translated ?? null,
    translated_to: m.translated_to ?? null,
    attachment_name: m.attachment_name ?? null,
    attachment_mime: m.attachment_mime ?? null,
    attachment_size: m.attachment_size ?? null,
    edited_at: m.edited_at ?? null,
    created_at: m.created_at,
  };
}

export async function listMessages(clientId: string | null): Promise<Message[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapMsg);
}

/**
 * Internal staff-only messages (client_id IS NULL): the "TyloTech Team" workspace.
 * RLS lets staff read the internal group + their own internal DMs.
 */
export async function listInternalMessages(): Promise<Message[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb
    .from("messages")
    .select("*")
    .is("client_id", null)
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapMsg);
}

/** Client-side users of a tenant — the staff-facing DM peer list. */
export async function listClientUsers(clientId: string | null): Promise<ChatPeer[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("users")
    .select("id,name,role")
    .eq("client_id", clientId)
    .eq("role", "client")
    .order("name");
  return (data ?? []).map((u: any) => ({ id: u.id, name: u.name, role: u.role as Role, title: "Client" }));
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: string;
  read: boolean;
  created_at: string;
}

export async function listNotifications(userId: string): Promise<NotificationRow[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as NotificationRow[];
}

export interface AiToolRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  prompt_template: string | null;
  is_active: boolean;
}

export async function listAiTools(): Promise<AiToolRow[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb
    .from("ai_tools")
    .select("id,name,slug,description,category,prompt_template,is_active")
    .order("name");
  return (data ?? []) as AiToolRow[];
}

/**
 * Fetch staff rows, tolerant of the `title` column not existing yet (pre-0014).
 * Tries with title, falls back without so the app never breaks before the migration.
 */
async function fetchStaff(client: any): Promise<any[]> {
  let res = await client.from("users").select("id,name,role,title").in("role", ["admin", "team"]).order("name");
  if (res.error) res = await client.from("users").select("id,name,role").in("role", ["admin", "team"]).order("name");
  return res.data ?? [];
}

const staffTitle = (u: any): string => u.title || ROLE_LABEL[u.role] || u.role;

export async function listTeamMembers(): Promise<TeamMember[]> {
  const sb = createClient();
  if (!sb) return [];
  const rows = await fetchStaff(sb);
  return rows.map((u: any) => ({ id: u.id, name: u.name, role: staffTitle(u) }));
}

/**
 * TyloTech staff as DM peers — the client-facing "message a specific person" list.
 * Uses the admin client so clients can see WHO to message (id + name only): RLS
 * otherwise hides staff user rows from clients, and we don't want to widen it.
 */
export async function listTeamPeers(): Promise<ChatPeer[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const rows = await fetchStaff(admin);
  return rows.map((u: any) => ({
    id: u.id,
    name: u.name,
    role: u.role as Role,
    title: staffTitle(u),
  }));
}

export interface ClientListRow extends Client {
  spend30d: number;
  leads30d: number;
  series30d: { date: string; spend: number }[];
  assignedTeam: { id: string; name: string }[];
}

/**
 * Staff-only: every client enriched with 30-day ad spend / leads, a daily
 * spend series for sparklines, and the team members assigned via projects.
 */
export async function listClientsEnriched(): Promise<ClientListRow[]> {
  const sb = createClient();
  if (!sb) return [];

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().slice(0, 10);

  const [{ data: clientRows }, { data: metricRows }, { data: projectRows }, staff] = await Promise.all([
    sb.from("clients").select("*").order("created_at", { ascending: true }),
    sb.from("metric_points").select("client_id,date,spend,leads,provider").in("provider", ["meta_ads", "google_ads"]).gte("date", sinceStr),
    sb.from("projects").select("client_id,assigned_to_id"),
    fetchStaff(sb),
  ]);

  const clients = (clientRows ?? []).map(mapClient);
  const staffById = new Map(staff.map((u: any) => [u.id, u.name as string]));

  const spendByClient = new Map<string, number>();
  const leadsByClient = new Map<string, number>();
  const seriesByClient = new Map<string, Map<string, number>>();

  for (const r of metricRows ?? []) {
    const cid = r.client_id as string;
    spendByClient.set(cid, (spendByClient.get(cid) ?? 0) + Number(r.spend));
    leadsByClient.set(cid, (leadsByClient.get(cid) ?? 0) + Number(r.leads));
    if (!seriesByClient.has(cid)) seriesByClient.set(cid, new Map());
    const dayMap = seriesByClient.get(cid)!;
    dayMap.set(r.date as string, (dayMap.get(r.date as string) ?? 0) + Number(r.spend));
  }

  const teamByClient = new Map<string, Map<string, string>>();
  for (const p of projectRows ?? []) {
    if (!p.assigned_to_id) continue;
    const cid = p.client_id as string;
    if (!teamByClient.has(cid)) teamByClient.set(cid, new Map());
    const name = staffById.get(p.assigned_to_id as string);
    if (name) teamByClient.get(cid)!.set(p.assigned_to_id as string, name);
  }

  return clients.map((c) => {
    const dayMap = seriesByClient.get(c.id);
    const series30d = dayMap
      ? Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, spend]) => ({ date, spend: Number(spend.toFixed(2)) }))
      : [];
    const tm = teamByClient.get(c.id);
    return {
      ...c,
      spend30d: Number((spendByClient.get(c.id) ?? 0).toFixed(2)),
      leads30d: leadsByClient.get(c.id) ?? 0,
      series30d,
      assignedTeam: tm ? Array.from(tm.entries()).map(([id, name]) => ({ id, name })) : [],
    };
  });
}

export async function listTeamLoad(): Promise<TeamLoad[]> {
  const sb = createClient();
  if (!sb) return [];
  const users = await fetchStaff(sb);
  if (!users.length) return [];
  const { data: projects } = await sb.from("projects").select("assigned_to_id,client_id,status");
  return users.map((u: any) => {
    const open = (projects ?? []).filter((p: any) => p.assigned_to_id === u.id && p.status !== "done");
    return {
      id: u.id,
      name: u.name,
      role: staffTitle(u),
      activeProjects: open.filter((p: any) => p.status === "in_progress" || p.status === "review").length,
      clients: new Set(open.map((p: any) => p.client_id)).size,
      avatar: null,
    };
  });
}
