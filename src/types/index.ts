export type Role = "admin" | "team" | "client";

export type Plan = "Starter" | "Growth" | "Scale" | "Enterprise";

export interface Client {
  id: string;
  slug?: string | null;
  name: string;
  company: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  plan: Plan;
  mrr: number;
  themeId: string;
  created_at: string;
}

export interface User {
  id: string;
  client_id: string;
  email: string;
  name: string;
  role: Role;
  avatar_url?: string | null;
}

export type ProjectStatus = "planning" | "in_progress" | "review" | "done" | "blocked";

export interface Project {
  id: string;
  client_id: string;
  name: string;
  status: ProjectStatus;
  progress: number;
  assigned_to: string;
  assigned_to_id?: string | null;
  due: string;
}

export interface Message {
  id: string;
  client_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: Role;
  /** null = tenant group thread; otherwise the direct-message recipient. */
  recipient_id?: string | null;
  content: string;
  content_translated?: string | null;
  translated_to?: string | null;
  /** Attachment metadata (path is server-only; download via /api/messages/attachment?id=). */
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  edited_at?: string | null;
  created_at: string;
}

/** A person you can start a direct thread with (team member or client user). */
export interface ChatPeer {
  id: string;
  name: string;
  role: Role;
  title?: string;
}

export type UpdateType = "milestone" | "report" | "campaign" | "note" | "alert";

export interface Update {
  id: string;
  client_id: string;
  title: string;
  description: string;
  type: UpdateType;
  created_at: string;
}

export type DocType = "contract" | "report" | "invoice" | "asset";

export interface DocItem {
  id: string;
  client_id: string;
  name: string;
  file_url: string;
  type: DocType;
  size: string;
  created_at: string;
}

export interface Kpi {
  id: string;
  client_id: string;
  metric_name: string;
  label: string;
  value: number;
  unit: "currency" | "number" | "percent" | "ratio" | "rank";
  delta: number; // % change vs previous period
  period: string;
  source: "Meta Ads" | "Google Ads" | "SEO" | "Manual";
}

export interface AiTool {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  category: "Content" | "SEO" | "Ads" | "Analytics";
  is_active: boolean;
  unlocked: boolean;
}

export interface SeriesPoint {
  date: string;
  spend: number;
  leads: number;
  roas: number;
}
