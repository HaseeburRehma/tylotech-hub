import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLeadEmail } from "@/lib/email";
import { wantsLeadEmail, type LeadField, type LeadSource } from "@/lib/leads-shared";
import { sendPush } from "@/lib/push";

/**
 * Speed-to-Lead fan-out for one new lead: everyone who can call it — the
 * partner's own people and the TyloTech team — gets, right away,
 *   · an in-app notification (the web shows the 60-second card live),
 *   · an urgent push (the TyloHQ app opens the countdown screen),
 *   · an email with the contact details and a call button, to partner users
 *     (unless they switched it off) and staff who switched it on.
 * No email cooldown here: a lead is time-critical, unlike chat.
 */

// Email preferences live in auth metadata: cached briefly so a burst of leads
// doesn't look every person up again for each one.
const PREF_TTL_MS = 60_000;
const prefCache = new Map<string, { at: number; meta: Record<string, unknown> | null }>();

async function leadEmailWanted(admin: SupabaseClient, p: { id: string; role: string }): Promise<boolean> {
  const hit = prefCache.get(p.id);
  if (hit && Date.now() - hit.at < PREF_TTL_MS) return wantsLeadEmail(p.role, hit.meta);
  let meta: Record<string, unknown> | null = null;
  try {
    const { data } = await admin.auth.admin.getUserById(p.id);
    meta = (data?.user?.user_metadata as Record<string, unknown> | undefined) ?? null;
  } catch {
    // Lookup failed: fall back to the role's default.
  }
  prefCache.set(p.id, { at: Date.now(), meta });
  if (prefCache.size > 2000) prefCache.delete(prefCache.keys().next().value as string);
  return wantsLeadEmail(p.role, meta);
}

/** Forget a cached preference (after the person changed it). */
export function forgetLeadEmailPref(userId: string) {
  prefCache.delete(userId);
}

export interface AlertLead {
  id: string;
  lead_no: number;
  client_id: string;
  source: LeadSource;
  name: string | null;
  email: string | null;
  phone: string | null;
  campaign: string | null;
  form: string | null;
  fields: LeadField[];
  is_test: boolean;
  created_at: string;
}

const SOURCE_LABEL: Record<string, string> = { meta: "Meta", google_ads: "Google Ads", webhook: "Website", manual: "Manuell", import: "Import" };

interface Person {
  id: string;
  email: string | null;
  role: string;
}

export async function alertNewLead(admin: SupabaseClient, lead: AlertLead) {
  const [{ data: client }, { data: people }] = await Promise.all([
    admin.from("clients").select("company,slug").eq("id", lead.client_id).maybeSingle(),
    admin.from("users").select("*").or(`client_id.eq.${lead.client_id},role.in.(admin,team)`),
  ]);
  // The partner's users (role client) + the whole TyloTech team; never other partners' users.
  const recipients = ((people ?? []) as any[])
    .filter((u) => !u.deactivated_at && (u.role === "admin" || u.role === "team" || (u.role === "client" && u.client_id === lead.client_id)))
    .map((u) => ({ id: u.id as string, email: (u.email as string | null) ?? null, role: u.role as string })) as Person[];
  if (!recipients.length) return { recipients: 0 };

  const partner = (client?.company as string | undefined) ?? "Partner";
  const who = lead.name ?? lead.email ?? lead.phone ?? "Unbekannt";
  const title = `${lead.is_test ? "Test-Lead" : "Neuer Lead"} #${lead.lead_no}: ${who}`;
  const body = [partner, SOURCE_LABEL[lead.source] ?? lead.source, lead.campaign ?? lead.form, "jetzt in 60 s anrufen"].filter(Boolean).join(" · ");
  // Staff work across partners, so their link names the partner; clients have one.
  const hrefFor = (p: Person) => (p.role === "client" ? `/leads?lead=${lead.id}` : `/leads?client=${encodeURIComponent((client?.slug as string | undefined) ?? lead.client_id)}&lead=${lead.id}`);

  await admin.from("notifications").insert(recipients.map((p) => ({ user_id: p.id, title, body, href: hrefFor(p), type: "lead" })));

  const pushes = ["client", "staff"].map((side) => {
    const ids = recipients.filter((p) => (side === "client" ? p.role === "client" : p.role !== "client")).map((p) => p.id);
    const sample = recipients.find((p) => (side === "client" ? p.role === "client" : p.role !== "client"));
    return ids.length && sample
      ? sendPush(admin, ids, { title, body, href: hrefFor(sample), type: "lead", urgent: true, data: { leadId: lead.id, createdAt: lead.created_at } }).catch(() => {})
      : null;
  });

  const withEmail = recipients.filter((p) => p.email);
  const wanted = await Promise.all(withEmail.map((p) => leadEmailWanted(admin, p)));
  const emails = withEmail
    .filter((_, i) => wanted[i])
    .map((p) =>
      sendLeadEmail(p.email!, {
        partner,
        leadNo: lead.lead_no,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: SOURCE_LABEL[lead.source] ?? lead.source,
        campaign: lead.campaign,
        form: lead.form,
        fields: lead.fields,
        isTest: lead.is_test,
        path: hrefFor(p),
      }).catch(() => false),
    );

  const results = await Promise.all([...pushes, ...emails]);
  return { recipients: recipients.length, emailsSent: results.slice(pushes.length).filter(Boolean).length, emailsSkipped: withEmail.length - emails.length };
}
