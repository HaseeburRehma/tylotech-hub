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
  title: string | null;
  avatarUrl: string | null;
  /** Email notifications for new messages/files (opt-out, stored in auth metadata). */
  notifyEmail: boolean;
}

/** Demo identity used only when Supabase isn't configured. */
export const DEMO_USER: AuthUser = {
  id: "demo",
  email: "demo@tylotech.de",
  name: "Demo Client",
  role: "client",
  client_id: "demo",
  company: "Demo Client",
  primaryColor: "#C9A84C",
  secondaryColor: "#181612",
  logoUrl: null,
  title: null,
  avatarUrl: null,
  notifyEmail: true,
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

  // Users with 2FA enrolled must complete it before any server code (pages or
  // API routes) treats them as signed in — a password alone is not enough.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") return null;

  const { data: profile } = await supabase
    .from("users")
    // `*` keeps this tolerant of columns added by later migrations (title, avatar_url, deactivated_at…).
    .select("*, clients(*)")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const client = Array.isArray(profile.clients) ? profile.clients[0] : profile.clients;

  // Deactivated staff and users of archived clients lose access (columns from 0030).
  if (profile.deactivated_at) return null;
  if (profile.role === "client" && client?.archived_at) return null;

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
    title: profile.title ?? null,
    avatarUrl: profile.avatar_url ?? null,
    notifyEmail: user.user_metadata?.notify_email !== false,
  };
});

export function isStaff(user: AuthUser | null): boolean {
  // Pure role check — no demo-mode bypass. DEMO_USER is role "client", so
  // staff-gated actions correctly stay unavailable when the backend isn't
  // configured, instead of trusting every caller as staff.
  return user?.role === "admin" || user?.role === "team";
}
