import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { META_GRAPH_VERSION } from "@/lib/integrations/fetchers";
import { ingestLead, type LeadField } from "@/lib/leads";

/**
 * Meta Lead Ads → Leads.
 *
 * Connect: the partner (or the team) signs in with Facebook and grants the
 * pages; every granted page becomes a lead source with its page token, and the
 * page is subscribed to this app's "leadgen" webhook. New leads then arrive in
 * real time (POST /api/leads/meta/webhook); "Sync" and the daily cron also
 * pull the last days from every lead form, so nothing is missed if a webhook
 * is lost or not configured yet.
 *
 * Needs on the Meta app: permissions leads_retrieval, pages_show_list,
 * pages_read_engagement, pages_manage_metadata, pages_manage_ads, ads_read
 * (Advanced Access via App Review for partners' pages) and a Page webhook
 * subscription to "leadgen" pointing at /api/leads/meta/webhook with
 * metaWebhookVerifyToken().
 */

export const META_LEADS_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval", "ads_read"].join(",");

const G = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const metaApp = () => {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  return id && secret ? { id, secret } : null;
};

/** Verify token for the webhook setup in the Meta app dashboard (derived — no extra env var). */
export function metaWebhookVerifyToken() {
  const app = metaApp();
  return app ? createHmac("sha256", app.secret).update("tylohq-leads-webhook").digest("hex").slice(0, 32) : null;
}

/** X-Hub-Signature-256 check for webhook deliveries. */
export function verifyMetaSignature(raw: string, header: string | null) {
  const app = metaApp();
  if (!app || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", app.secret).update(raw).digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET"): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${G}/${path}${method === "GET" ? `?${qs}` : ""}`, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? qs : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Graph ${res.status}`);
  return json;
}

/**
 * OAuth callback for provider "meta_leads": code → long-lived user token →
 * the granted pages (with page tokens) → lead sources + webhook subscription,
 * then a first pull of recent leads. Returns how many pages were connected.
 */
export async function connectMetaPages(admin: SupabaseClient, opts: { code: string; redirectUri: string; clientId: string; userId: string }) {
  const app = metaApp();
  if (!app) throw new Error("not_configured");
  const short = await fetch(
    `${G}/oauth/access_token?${new URLSearchParams({ client_id: app.id, client_secret: app.secret, redirect_uri: opts.redirectUri, code: opts.code })}`,
    { cache: "no-store" },
  ).then((r) => r.json() as Promise<{ access_token?: string }>);
  if (!short.access_token) throw new Error("token_exchange");
  const long = await fetch(
    `${G}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: short.access_token })}`,
    { cache: "no-store" },
  ).then((r) => r.json() as Promise<{ access_token?: string }>);
  const userToken = long.access_token ?? short.access_token;

  const perms = await graph<{ data: { permission: string; status: string }[] }>("me/permissions", userToken);
  const granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
  if (!granted.has("leads_retrieval") || !granted.has("pages_show_list")) throw new Error("missing_scope");

  // Page tokens derived from a long-lived user token don't expire.
  const pages = await graph<{ data: { id: string; name: string; access_token?: string }[] }>("me/accounts", userToken, { fields: "id,name,access_token", limit: "100" });
  let connected = 0;
  for (const p of pages.data) {
    if (!p.access_token) continue;
    let status: "active" | "error" = "active";
    let lastError: string | null = null;
    try {
      await graph(`${p.id}/subscribed_apps`, p.access_token, { subscribed_fields: "leadgen" }, "POST");
    } catch (e) {
      status = "error";
      lastError = `Webhook: ${(e as Error).message}`.slice(0, 300);
    }
    const { error } = await admin.from("lead_sources").upsert(
      { client_id: opts.clientId, kind: "meta", label: p.name.slice(0, 120), external_id: p.id, access_token: p.access_token, status, last_error: lastError, created_by: opts.userId },
      { onConflict: "client_id,kind,external_id" },
    );
    if (!error) connected++;
  }
  if (connected) await syncMetaLeads(admin, { clientId: opts.clientId, days: 90 }).catch(() => {});
  return connected;
}

const LEAD_FIELDS = "id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic";

interface MetaLead {
  id: string;
  created_time: string;
  field_data?: { name: string; values?: string[] }[];
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
}

async function storeMetaLead(admin: SupabaseClient, source: { id: string; client_id: string }, l: MetaLead, formName: string | null, notify: boolean) {
  const fields: LeadField[] = (l.field_data ?? []).map((f) => ({ label: f.name, value: (f.values ?? []).join(", ") }));
  return ingestLead(admin, {
    clientId: source.client_id,
    source: "meta",
    sourceId: source.id,
    externalId: l.id,
    createdAt: l.created_time,
    fields,
    campaign: l.campaign_name ?? (l.is_organic ? "Organisch" : null),
    adGroup: l.adset_name ?? null,
    ad: l.ad_name ?? null,
    form: formName ?? (l.form_id ? `Formular ${l.form_id}` : null),
    platform: l.platform === "ig" ? "instagram" : l.platform === "fb" ? "facebook" : l.platform ?? "facebook",
    notify,
  });
}

/** Webhook: one leadgen event → fetch the full lead with the page token → store it. */
export async function handleLeadgenEvent(admin: SupabaseClient, ev: { leadgen_id?: string; page_id?: string; form_id?: string }) {
  if (!ev.leadgen_id || !ev.page_id) return 0;
  const { data: sources } = await admin.from("lead_sources").select("id,client_id,access_token").eq("kind", "meta").eq("external_id", ev.page_id);
  let stored = 0;
  for (const s of sources ?? []) {
    if (!s.access_token) continue;
    try {
      const lead = await graph<MetaLead>(ev.leadgen_id, s.access_token, { fields: LEAD_FIELDS });
      const form = lead.form_id ? await graph<{ name?: string }>(lead.form_id, s.access_token, { fields: "name" }).catch(() => ({ name: undefined })) : { name: undefined };
      const res = await storeMetaLead(admin, s, lead, form.name ?? null, true);
      if (!("error" in res) && !res.duplicate) stored++;
    } catch (e) {
      await admin.from("lead_sources").update({ status: "error", last_error: (e as Error).message.slice(0, 300) }).eq("id", s.id);
    }
  }
  return stored;
}

/**
 * Pull recent leads from every lead form of a partner's Meta pages (or all
 * partners when clientId is omitted). New ones notify only when `notify`.
 */
export async function syncMetaLeads(admin: SupabaseClient, opts: { clientId?: string; days?: number; notify?: boolean } = {}) {
  let q = admin.from("lead_sources").select("id,client_id,access_token,external_id,last_synced_at").eq("kind", "meta").neq("status", "disconnected");
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data: sources } = await q;
  let added = 0;
  for (const s of sources ?? []) {
    if (!s.access_token || !s.external_id) continue;
    const since = s.last_synced_at && !opts.days ? new Date(new Date(s.last_synced_at).getTime() - 86_400_000) : new Date(Date.now() - (opts.days ?? 30) * 86_400_000);
    try {
      const forms = await graph<{ data: { id: string; name: string }[] }>(`${s.external_id}/leadgen_forms`, s.access_token, { fields: "id,name", limit: "100" });
      for (const f of forms.data) {
        let after: string | undefined;
        for (let page = 0; page < 10; page++) {
          const res = await graph<{ data: MetaLead[]; paging?: { cursors?: { after?: string }; next?: string } }>(`${f.id}/leads`, s.access_token, {
            fields: LEAD_FIELDS,
            limit: "100",
            filtering: JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) }]),
            ...(after ? { after } : {}),
          });
          for (const l of res.data) {
            const r = await storeMetaLead(admin, s, l, f.name, !!opts.notify);
            if (!("error" in r) && !r.duplicate) added++;
          }
          after = res.paging?.next ? res.paging.cursors?.after : undefined;
          if (!after) break;
        }
      }
      await admin.from("lead_sources").update({ last_synced_at: new Date().toISOString(), status: "active", last_error: null }).eq("id", s.id);
    } catch (e) {
      await admin.from("lead_sources").update({ status: "error", last_error: (e as Error).message.slice(0, 300) }).eq("id", s.id);
    }
  }
  return added;
}
