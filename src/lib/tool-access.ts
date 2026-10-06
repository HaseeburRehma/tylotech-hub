import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI tool slugs switched OFF for one client (client_tools.is_unlocked = false).
 * No row means the tool is available, so existing clients keep every tool
 * until staff restrict them. Tolerates the table/join being unavailable.
 */
export async function lockedToolSlugs(sb: SupabaseClient, clientId: string | null): Promise<Set<string>> {
  if (!clientId) return new Set();
  const { data, error } = await sb
    .from("client_tools")
    .select("is_unlocked, ai_tools(slug)")
    .eq("client_id", clientId)
    .eq("is_unlocked", false);
  if (error || !data) return new Set();
  return new Set(
    data
      .map((r: any) => (Array.isArray(r.ai_tools) ? r.ai_tools[0]?.slug : r.ai_tools?.slug) as string | undefined)
      .filter((s): s is string => !!s),
  );
}
