/**
 * Single source of truth for "is Supabase wired up yet?".
 * When env keys are absent the app runs entirely on the mock data layer,
 * so the UI is fully demoable before the backend is provisioned.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
