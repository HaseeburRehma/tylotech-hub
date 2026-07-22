import { cache } from "react";
import { Role } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  client_id: string | null;
  company: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
}

/** Demo identity used only when Supabase isn't configured. */
export const DEMO_USER: AuthUser = {
  id: "demo",
  email: "marcus@nordicestate.com",
  name: "Marcus Holt",
  role: "client",
  client_id: "nordic",
  company: "Nordic Estate",
  primaryColor: "#38BDF8",
  secondaryColor: "#0C141C",
  logoUrl: null,
};

/**
 * Resolves the current user + tenant + brand. Memoized per request via React cache
 * so layout + page can both call it without a second round-trip.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (!isSupabaseConfigured) return DEMO_USER;

  const supabase = createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id,email,name,role,client_id, clients(company,primary_color,secondary_color,logo_url)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const client = Array.isArray(profile.clients) ? profile.clients[0] : profile.clients;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role as Role,
    client_id: profile.client_id,
    company: client?.company ?? null,
    primaryColor: client?.primary_color ?? null,
    secondaryColor: client?.secondary_color ?? null,
    logoUrl: client?.logo_url ?? null,
  };
});

export function isStaff(user: AuthUser | null): boolean {
  // In demo mode (no backend) everything is visible.
  if (!isSupabaseConfigured) return true;
  return user?.role === "admin" || user?.role === "team";
}
