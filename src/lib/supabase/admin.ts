import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Service-role client — bypasses RLS. SERVER ONLY. Use for privileged admin
 * operations (client onboarding, provisioning) — never import into a client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSupabaseConfigured || !key) return null;
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
