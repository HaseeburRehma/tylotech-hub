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
  load: number;
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
 * to get that source's own numbers untouched; omit it to get the combined view —
 * same-day rows from different sources summed (roas averaged) into one point,
 * matching the pre-multi-source shape callers like the dashboard already expect.
 */
export async function getSeries(clientId: string | null, provider?: string): Promise<SeriesPoint[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  let query = sb.from("metric_points").select("date,spend,leads,roas,provider").eq("client_id", clientId);
  if (provider) query = query.eq("provider", provider);
  const { data } = await query.order("date", { ascending: true });
  const rows = data ?? [];

  if (provider) {
    return rows.map((p: any) => ({ date: p.date, spend: Number(p.spend), leads: Number(p.leads), roas: Number(p.roas) }));
  }

  const byDate = new Map<string, { spend: number; leads: number; roasTotal: number; roasCount: number }>();
  for (const p of rows) {
    const cur = byDate.get(p.date) ?? { spend: 0, leads: 0, roasTotal: 0, roasCount: 0 };
    cur.spend += Number(p.spend);
    cur.leads += Number(p.leads);
    const roas = Number(p.roas);
    if (roas) {
      cur.roasTotal += roas;
      cur.roasCount += 1;
    }
    byDate.set(p.date, cur);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      spend: v.spend,
      leads: v.leads,
      roas: v.roasCount ? Number((v.roasTotal / v.roasCount).toFixed(2)) : 0,
    }));
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

export async function listMessages(clientId: string | null): Promise<Message[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m: any) => ({
    id: m.id,
    client_id: m.client_id,
    sender_id: m.sender_id,
    sender_name: m.sender_name ?? "TyloTech",
    sender_role: (m.sender_role ?? "team") as Role,
    recipient_id: m.recipient_id ?? null,
    content: m.content ?? "",
    content_translated: m.content_translated ?? null,
    translated_to: m.translated_to ?? null,
    attachment_name: m.attachment_name ?? null,
    attachment_mime: m.attachment_mime ?? null,
    attachment_size: m.attachment_size ?? null,
    edited_at: m.edited_at ?? null,
    created_at: m.created_at,
  }));
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
  return (data ?? []).map((m: any) => ({
    id: m.id,
    client_id: m.client_id,
    sender_id: m.sender_id,
    sender_name: m.sender_name ?? "TyloTech",
    sender_role: (m.sender_role ?? "team") as Role,
    recipient_id: m.recipient_id ?? null,
    content: m.content ?? "",
    content_translated: m.content_translated ?? null,
    translated_to: m.translated_to ?? null,
    attachment_name: m.attachment_name ?? null,
    attachment_mime: m.attachment_mime ?? null,
    attachment_size: m.attachment_size ?? null,
    edited_at: m.edited_at ?? null,
    created_at: m.created_at,
  }));
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

export async function listTeamLoad(): Promise<TeamLoad[]> {
  const sb = createClient();
  if (!sb) return [];
  const users = await fetchStaff(sb);
  if (!users.length) return [];
  const { data: projects } = await sb.from("projects").select("assigned_to_id,client_id,status");
  return users.map((u: any) => {
    const mine = (projects ?? []).filter((p: any) => p.assigned_to_id === u.id);
    const active = mine.filter((p: any) => p.status === "in_progress" || p.status === "review").length;
    const clients = new Set(mine.map((p: any) => p.client_id)).size;
    return {
      id: u.id,
      name: u.name,
      role: staffTitle(u),
      // No fixed baseline — a member with zero assigned clients/projects is at
      // 0% load, not a fabricated "healthy" floor.
      load: Math.min(100, clients * 15 + active * 20),
      clients,
      avatar: null,
    };
  });
}
