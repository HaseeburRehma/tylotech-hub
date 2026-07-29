/**
 * Server-side data access layer. Import ONLY from server components / route handlers.
 * Reads through the RLS-scoped Supabase server client. Real data only — no mock
 * fallbacks. Callers render clean empty states when a list is empty.
 */
import { createClient } from "@/lib/supabase/server";
import type { Client, DocItem, Kpi, Message, Project, Role, SeriesPoint, Update } from "@/types";

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

export async function getSeries(clientId: string | null): Promise<SeriesPoint[]> {
  const sb = createClient();
  if (!sb || !clientId) return [];
  const { data } = await sb
    .from("metric_points")
    .select("date,spend,leads,roas")
    .eq("client_id", clientId)
    .order("date", { ascending: true });
  return (data ?? []).map((p: any) => ({
    date: p.date,
    spend: Number(p.spend),
    leads: Number(p.leads),
    roas: Number(p.roas),
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
    content: m.content,
    content_translated: m.content_translated ?? null,
    translated_to: m.translated_to ?? null,
    created_at: m.created_at,
  }));
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

export async function listTeamMembers(): Promise<TeamMember[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data } = await sb.from("users").select("id,name,role").in("role", ["admin", "team"]);
  return (data ?? []).map((u: any) => ({ id: u.id, name: u.name, role: ROLE_LABEL[u.role] ?? u.role }));
}

export async function listTeamLoad(): Promise<TeamLoad[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data: users } = await sb.from("users").select("id,name,role").in("role", ["admin", "team"]);
  if (!users?.length) return [];
  const { data: projects } = await sb.from("projects").select("assigned_to_id,client_id,status");
  return users.map((u: any) => {
    const mine = (projects ?? []).filter((p: any) => p.assigned_to_id === u.id);
    const active = mine.filter((p: any) => p.status === "in_progress" || p.status === "review").length;
    const clients = new Set(mine.map((p: any) => p.client_id)).size;
    return {
      id: u.id,
      name: u.name,
      role: ROLE_LABEL[u.role] ?? u.role,
      load: Math.min(100, 25 + active * 20),
      clients,
      avatar: null,
    };
  });
}
