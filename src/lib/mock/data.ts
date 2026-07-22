import {
  AiTool,
  Client,
  DocItem,
  Kpi,
  Message,
  Project,
  SeriesPoint,
  Update,
  User,
} from "@/types";

export const CURRENT_USER: User = {
  id: "u_client_1",
  client_id: "nordic",
  email: "marcus@nordicestate.com",
  name: "Marcus Holt",
  role: "client",
  avatar_url: null,
};

export const CLIENTS: Client[] = [
  {
    id: "nordic",
    name: "Nordic Estate",
    company: "Nordic Estate",
    logo_url: null,
    primary_color: "#38BDF8",
    secondary_color: "#0C141C",
    plan: "Scale",
    mrr: 6800,
    themeId: "nordic",
    created_at: "2025-09-01",
  },
  {
    id: "velform",
    name: "Velform Fitness",
    company: "Velform Fitness",
    logo_url: null,
    primary_color: "#F43F5E",
    secondary_color: "#1A0E12",
    plan: "Growth",
    mrr: 4200,
    themeId: "velform",
    created_at: "2025-11-12",
  },
  {
    id: "lumen",
    name: "Lumen Dental",
    company: "Lumen Dental",
    logo_url: null,
    primary_color: "#A78BFA",
    secondary_color: "#15121F",
    plan: "Growth",
    mrr: 3900,
    themeId: "tylotech",
    created_at: "2026-01-08",
  },
  {
    id: "altan",
    name: "Altan Legal",
    company: "Altan Legal",
    logo_url: null,
    primary_color: "#34D399",
    secondary_color: "#0E1714",
    plan: "Enterprise",
    mrr: 9500,
    themeId: "tylotech",
    created_at: "2025-06-20",
  },
  {
    id: "brava",
    name: "Brava Hotels",
    company: "Brava Hotels",
    logo_url: null,
    primary_color: "#FB923C",
    secondary_color: "#1C1410",
    plan: "Scale",
    mrr: 7300,
    themeId: "tylotech",
    created_at: "2025-08-15",
  },
  {
    id: "kova",
    name: "Kova Studio",
    company: "Kova Studio",
    logo_url: null,
    primary_color: "#C9A84C",
    secondary_color: "#181612",
    plan: "Starter",
    mrr: 1800,
    themeId: "tylotech",
    created_at: "2026-02-28",
  },
];

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

export const KPIS: Record<string, Kpi[]> = {
  nordic: [
    { id: "k1", client_id: "nordic", metric_name: "ad_spend", label: "Monthly Ad Spend", value: 18400, unit: "currency", delta: 12.4, period: "Jun 2026", source: "Meta Ads" },
    { id: "k2", client_id: "nordic", metric_name: "leads", label: "Leads Generated", value: 342, unit: "number", delta: 23.1, period: "Jun 2026", source: "Meta Ads" },
    { id: "k3", client_id: "nordic", metric_name: "cpl", label: "Cost Per Lead", value: 53.8, unit: "currency", delta: -8.6, period: "Jun 2026", source: "Google Ads" },
    { id: "k4", client_id: "nordic", metric_name: "roas", label: "ROAS", value: 4.7, unit: "ratio", delta: 0.6, period: "Jun 2026", source: "Meta Ads" },
  ],
};

export function kpisFor(clientId: string): Kpi[] {
  return KPIS[clientId] ?? KPIS.nordic;
}

// Deterministic pseudo-noise so server and client renders match (no Math.random()).
const noise = (i: number) => (Math.sin(i * 12.9898) * 43758.5453) % 1;

export const SERIES: SeriesPoint[] = Array.from({ length: 30 }).map((_, i) => {
  const base = 480 + Math.sin(i / 3) * 120 + i * 14;
  return {
    date: new Date(2026, 5, i + 1).toISOString().slice(0, 10),
    spend: Math.round(base + Math.abs(noise(i)) * 80),
    leads: Math.round(8 + Math.sin(i / 2) * 4 + i * 0.3 + Math.abs(noise(i + 7)) * 3),
    roas: Number((3.4 + Math.sin(i / 4) * 0.8 + i * 0.02).toFixed(2)),
  };
});

export const CHANNEL_SPLIT = [
  { name: "Meta Ads", value: 46, color: "rgb(var(--info))" },
  { name: "Google Ads", value: 34, color: "rgb(var(--brand))" },
  { name: "SEO", value: 14, color: "rgb(var(--success))" },
  { name: "Email", value: 6, color: "rgb(var(--warning))" },
];

export const PROJECTS: Project[] = [
  { id: "p1", client_id: "nordic", name: "Q3 Meta Ads Scaling", status: "in_progress", progress: 68, assigned_to: "Sofia Lind", due: "2026-07-15" },
  { id: "p2", client_id: "nordic", name: "Landing Page Redesign", status: "review", progress: 90, assigned_to: "Dawood R.", due: "2026-06-28" },
  { id: "p3", client_id: "nordic", name: "SEO Content Cluster", status: "in_progress", progress: 42, assigned_to: "Haseeb K.", due: "2026-07-30" },
  { id: "p4", client_id: "nordic", name: "CRM Automation", status: "planning", progress: 12, assigned_to: "Sofia Lind", due: "2026-08-10" },
];

export const UPDATES: Update[] = [
  { id: "up1", client_id: "nordic", title: "June campaign hit 4.7x ROAS", description: "The retargeting set outperformed projections by 18%. We're reallocating budget from cold prospecting into the winning audiences.", type: "milestone", created_at: minsAgo(120) },
  { id: "up2", client_id: "nordic", title: "Monthly performance report ready", description: "Your June report is available in Documents with a full channel breakdown and next-month recommendations.", type: "report", created_at: minsAgo(360) },
  { id: "up3", client_id: "nordic", title: "New ad creative batch live", description: "8 new video creatives launched across Meta. Early CTR is 2.3% — above the 1.6% benchmark.", type: "campaign", created_at: minsAgo(1500) },
  { id: "up4", client_id: "nordic", title: "Tracking pixel issue resolved", description: "A conversion tracking gap on the contact form was fixed. Attribution is now accurate end-to-end.", type: "alert", created_at: minsAgo(3000) },
];

export const MESSAGES: Message[] = [
  { id: "m1", client_id: "nordic", sender_id: "u_team_1", sender_name: "Sofia Lind", sender_role: "team", content: "Morning Marcus! June numbers are in and they look fantastic — 4.7x ROAS 🎉", created_at: minsAgo(58) },
  { id: "m2", client_id: "nordic", sender_id: "u_client_1", sender_name: "Marcus Holt", sender_role: "client", content: "That's brilliant. Can we push more budget into the winning audiences?", created_at: minsAgo(52) },
  { id: "m3", client_id: "nordic", sender_id: "u_team_1", sender_name: "Sofia Lind", sender_role: "team", content: "Already on it — reallocating €3k from cold prospecting today. I'll send a revised projection this afternoon.", created_at: minsAgo(47) },
  { id: "m4", client_id: "nordic", sender_id: "u_client_1", sender_name: "Marcus Holt", sender_role: "client", content: "Perfect. Also, could you generate a few new ad copies for the summer listing push?", created_at: minsAgo(20) },
  { id: "m5", client_id: "nordic", sender_id: "u_team_1", sender_name: "Sofia Lind", sender_role: "team", content: "Absolutely — you can try the Ad Copy Generator in AI Tools too, it's unlocked on your plan. I'll polish whatever it produces.", created_at: minsAgo(14) },
];

export const DOCUMENTS: DocItem[] = [
  { id: "d1", client_id: "nordic", name: "June 2026 Performance Report.pdf", file_url: "#", type: "report", size: "2.4 MB", created_at: "2026-06-20" },
  { id: "d2", client_id: "nordic", name: "Service Agreement — Scale Plan.pdf", file_url: "#", type: "contract", size: "640 KB", created_at: "2025-09-01" },
  { id: "d3", client_id: "nordic", name: "Invoice #2026-0612.pdf", file_url: "#", type: "invoice", size: "180 KB", created_at: "2026-06-01" },
  { id: "d4", client_id: "nordic", name: "Brand Asset Pack.zip", file_url: "#", type: "asset", size: "18.2 MB", created_at: "2025-09-05" },
  { id: "d5", client_id: "nordic", name: "May 2026 Performance Report.pdf", file_url: "#", type: "report", size: "2.1 MB", created_at: "2026-05-19" },
  { id: "d6", client_id: "nordic", name: "Invoice #2026-0512.pdf", file_url: "#", type: "invoice", size: "176 KB", created_at: "2026-05-01" },
];

export const AI_TOOLS: AiTool[] = [
  { id: "t1", name: "Content Generator", slug: "content-generator", description: "Generate social posts, captions and blog drafts in your brand voice.", icon: "PenLine", category: "Content", is_active: true, unlocked: true },
  { id: "t2", name: "Ad Copy Generator", slug: "ad-copy", description: "Meta & Google ad variations engineered to convert.", icon: "Megaphone", category: "Ads", is_active: true, unlocked: true },
  { id: "t3", name: "SEO Analyzer", slug: "seo-analyzer", description: "Analyze any URL or keyword and get prioritized fixes.", icon: "Search", category: "SEO", is_active: true, unlocked: true },
  { id: "t4", name: "Audience Insights", slug: "audience", description: "Turn raw analytics into plain-language audience personas.", icon: "Users", category: "Analytics", is_active: true, unlocked: true },
  { id: "t5", name: "Email Sequencer", slug: "email", description: "Draft full nurture sequences from a single prompt.", icon: "Mail", category: "Content", is_active: true, unlocked: true },
  { id: "t6", name: "Landing Page Auditor", slug: "lp-audit", description: "Conversion-rate review of any landing page, section by section.", icon: "LayoutTemplate", category: "Analytics", is_active: true, unlocked: true },
];

// ---- Internal hub aggregates ----
export const MRR_SERIES = Array.from({ length: 12 }).map((_, i) => ({
  month: new Date(2025, 6 + i, 1).toLocaleDateString("en", { month: "short" }),
  mrr: Math.round(18000 + i * 2600 + Math.sin(i) * 1200),
}));

export const TEAM = [
  { id: "tm1", name: "Sofia Lind", role: "Account Lead", load: 82, clients: 4, avatar: null },
  { id: "tm2", name: "Dawood R.", role: "Design", load: 64, clients: 6, avatar: null },
  { id: "tm3", name: "Haseeb K.", role: "Engineering", load: 91, clients: 5, avatar: null },
  { id: "tm4", name: "Ilias El Aradi", role: "Founder / Strategy", load: 47, clients: 6, avatar: null },
];

export const PIPELINE: { stage: string; projects: { name: string; client: string }[] }[] = [
  { stage: "Planning", projects: [{ name: "CRM Automation", client: "Nordic Estate" }, { name: "Brand Refresh", client: "Kova Studio" }] },
  { stage: "In Progress", projects: [{ name: "Q3 Ads Scaling", client: "Nordic Estate" }, { name: "Membership Funnel", client: "Velform Fitness" }, { name: "Local SEO", client: "Lumen Dental" }] },
  { stage: "Review", projects: [{ name: "Landing Redesign", client: "Nordic Estate" }, { name: "Booking Flow", client: "Brava Hotels" }] },
  { stage: "Done", projects: [{ name: "Pixel Migration", client: "Altan Legal" }] },
];
