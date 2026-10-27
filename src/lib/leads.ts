import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthUser, isStaff, type AuthUser } from "@/lib/auth";
import { inBackground } from "@/lib/background";
import { alertNewLead } from "@/lib/lead-alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickContact, type LeadField, type LeadSource, type LeadSourceView } from "@/lib/leads-shared";

export * from "@/lib/leads-shared";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const missingLeads = (msg: string | undefined) => /\bleads\b|lead_sources|lead_activities|schema cache|does not exist/i.test(msg ?? "");
export const LEADS_NOT_READY = "Leads need database migration 0043. Ask an admin to run it.";

type Ctx = { user: AuthUser; admin: SupabaseClient; clientId: string };

/**
 * Who may work on a partner's leads: the TyloTech team (any partner, by id)
 * and the partner's own people (their company only).
 */
export async function leadsContext(clientIdParam?: string | null): Promise<Ctx | { error: NextResponse }> {
  const user = await getAuthUser();
  if (!user) return { error: bad("Unauthorized.", 401) };
  const admin = createAdminClient();
  if (!admin) return { error: bad("Backend not configured.", 503) };
  const clientId = isStaff(user) ? clientIdParam ?? null : user.client_id;
  if (!clientId || !UUID_RE.test(clientId)) return { error: bad(isStaff(user) ? "Pick a partner." : "Forbidden.", isStaff(user) ? 400 : 403) };
  return { user, admin, clientId };
}

/** Same, for one lead by id. */
export async function leadContext(leadId: string) {
  const user = await getAuthUser();
  if (!user) return { error: bad("Unauthorized.", 401) } as const;
  if (!UUID_RE.test(leadId)) return { error: bad("Invalid lead id.") } as const;
  const admin = createAdminClient();
  if (!admin) return { error: bad("Backend not configured.", 503) } as const;
  const { data: lead, error } = await admin.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) return { error: missingLeads(error.message) ? bad(LEADS_NOT_READY, 503) : bad("Could not load the lead.") } as const;
  if (!lead || (!isStaff(user) && lead.client_id !== user.client_id)) return { error: bad("Lead not found.", 404) } as const;
  return { user, admin, lead } as const;
}

/** People who can own a lead: the partner's users and the TyloTech team. */
export async function leadPeople(admin: SupabaseClient, clientId: string) {
  const { data } = await admin
    .from("users")
    .select("id,name,title,role,client_id,deactivated_at")
    .or(`client_id.eq.${clientId},role.in.(admin,team)`)
    .order("name");
  return ((data ?? []) as any[]).filter((u) => !u.deactivated_at).map((u) => ({ id: u.id as string, name: u.name as string, title: (u.title as string | null) ?? null, role: u.role as string }));
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
  meta: "Meta",
  google_ads: "Google Ads",
  webhook: "Website",
  manual: "Manuell",
  import: "Import",
};

export interface IncomingLead {
  clientId: string;
  source: LeadSource;
  sourceId?: string | null;
  externalId?: string | null;
  createdAt?: string | null;
  fields: LeadField[];
  campaign?: string | null;
  adGroup?: string | null;
  ad?: string | null;
  form?: string | null;
  platform?: string | null;
  isTest?: boolean;
  /** Short labels from the source ("Vollständig", "Teil-Lead", "Retreat"). Needs migration 0047. */
  tags?: string[];
  /** Explicit contact data (manual entry); otherwise picked from the fields. */
  contact?: { name?: string | null; email?: string | null; phone?: string | null };
  actorId?: string | null;
  notify?: boolean;
}

const clean = (v: unknown, max = 500) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Store a lead once (same source + external id → skipped), log "created" and
 * tell the partner's people (in-app, push, email). Returns the lead or null
 * when it was a duplicate.
 */
/** The row a lead is stored as (cleaned, contact picked from the answers when not given). */
export function leadRow(l: IncomingLead) {
  const fields = l.fields
    .map((f) => ({ label: clean(f.label, 200) ?? "", value: clean(f.value, 4000) ?? "" }))
    .filter((f) => f.label && f.value)
    .slice(0, 80);
  const picked = pickContact(fields);
  const row = {
    client_id: l.clientId,
    source: l.source,
    source_id: l.sourceId ?? null,
    external_id: clean(l.externalId, 200),
    name: clean(l.contact?.name, 200) ?? picked.name,
    email: (clean(l.contact?.email, 320) ?? picked.email)?.toLowerCase() ?? null,
    phone: clean(l.contact?.phone, 60) ?? picked.phone,
    campaign: clean(l.campaign, 300),
    ad_group: clean(l.adGroup, 300),
    ad: clean(l.ad, 300),
    form: clean(l.form, 300),
    platform: clean(l.platform, 60),
    fields,
    is_test: !!l.isTest,
    created_at: l.createdAt && !Number.isNaN(Date.parse(l.createdAt)) ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
    // Only sent when there are tags, so sources keep working before migration 0047.
    ...(l.tags?.length ? { tags: Array.from(new Set(l.tags.map((t) => t.trim().slice(0, 40)).filter(Boolean))).slice(0, 12) } : {}),
  };
  return row;
}

export async function ingestLead(admin: SupabaseClient, l: IncomingLead): Promise<{ id: string; lead_no: number; duplicate?: boolean } | { error: string }> {
  const row = leadRow(l);
  if (row.external_id) {
    const { data: dup } = await admin
      .from("leads")
      .select("id,lead_no")
      .eq("client_id", l.clientId)
      .eq("source", l.source)
      .eq("external_id", row.external_id)
      .maybeSingle();
    if (dup) return { id: dup.id, lead_no: dup.lead_no, duplicate: true };
  }
  const { data, error } = await admin.from("leads").insert(row).select("id,lead_no").single();
  if (error || !data) {
    if (error?.code === "23505" && row.external_id) {
      const { data: dup } = await admin.from("leads").select("id,lead_no").eq("client_id", l.clientId).eq("source", l.source).eq("external_id", row.external_id).maybeSingle();
      if (dup) return { id: dup.id, lead_no: dup.lead_no, duplicate: true };
    }
    return { error: error?.message ?? "insert failed" };
  }
  await admin.from("lead_activities").insert({
    lead_id: data.id,
    client_id: l.clientId,
    user_id: l.actorId ?? null,
    kind: "created",
    body: null,
    meta: { source: l.source, campaign: row.campaign, form: row.form },
  });
  if (l.sourceId) await admin.from("lead_sources").update({ last_received_at: new Date().toISOString(), status: "active", last_error: null }).eq("id", l.sourceId);
  if (l.notify !== false) {
    // Partner + TyloTech team: in-app, urgent push (60 s countdown), email — in
    // the background so the webhook answers Meta fast.
    inBackground("lead-alert", () => alertNewLead(admin, { ...row, id: data.id, lead_no: data.lead_no }));
  }
  return { id: data.id, lead_no: data.lead_no };
}

/** Timeline entry + "last activity" bump. */
export async function logLeadActivity(
  admin: SupabaseClient,
  lead: { id: string; client_id: string },
  userId: string | null,
  kind: string,
  body: string | null,
  meta: Record<string, unknown> | null = null,
) {
  await admin.from("lead_activities").insert({ lead_id: lead.id, client_id: lead.client_id, user_id: userId, kind, body, meta });
  await admin.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", lead.id);
}

/** Webhook URL for a source (shown to people who manage sources). */
export const hookUrl = (origin: string, sourceId: string) => `${origin}/api/leads/hook/${sourceId}`;

/** A lead_sources row as the UI may see it: never a token; hook URL and key only for webhook kinds. */
export function sourceView(origin: string, s: any): LeadSourceView {
  const hook = s.kind === "google_ads" || s.kind === "webhook";
  const cfg = (s.config ?? {}) as { tabs?: string[]; title?: string };
  return {
    id: s.id,
    kind: s.kind,
    label: s.label,
    status: s.status,
    last_error: s.last_error,
    last_received_at: s.last_received_at,
    last_synced_at: s.last_synced_at,
    created_at: s.created_at,
    hookUrl: hook ? hookUrl(origin, s.id) : null,
    key: hook ? s.secret : null,
    ...(s.kind === "google_sheet" ? { sheet: { tabs: Array.isArray(cfg.tabs) ? cfg.tabs : [], title: cfg.title ?? null } } : {}),
  };
}

export { isStaff };
