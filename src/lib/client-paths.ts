import { createAdminClient } from "@/lib/supabase/admin";

const cache = new Map<string, string>();

/**
 * Staff URL of a partner by its readable slug (/internal/clients/fahrschule-abgefahrn)
 * — links in notifications and emails never carry internal ids.
 */
export async function staffClientPath(clientId: string, suffix = ""): Promise<string> {
  let slug = cache.get(clientId);
  if (!slug) {
    const admin = createAdminClient();
    const { data } = admin ? await admin.from("clients").select("slug").eq("id", clientId).maybeSingle() : { data: null };
    slug = (data?.slug as string | undefined) || "";
    if (slug) cache.set(clientId, slug);
  }
  // No slug (shouldn't happen) → the client list rather than an id URL.
  return slug ? `/internal/clients/${slug}${suffix}` : "/internal/clients";
}
