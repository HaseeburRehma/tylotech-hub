import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * The mobile app (tylohq-mobile) has no cookies — it sends its Supabase access
 * token as `Authorization: Bearer <jwt>`. Returns that token when present.
 * Browsers never send this header to our API, so cookie auth is unaffected.
 */
export function bearerToken(): string | null {
  let value: string | null = null;
  try {
    value = headers().get("authorization");
  } catch {
    return null; // outside a request scope (e.g. build time)
  }
  const m = value?.match(/^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/);
  return m ? m[1] : null;
}

export function createClient() {
  if (!isSupabaseConfigured) return null;

  // Token auth: every query runs as that user under RLS, exactly like a cookie session.
  const token = bearerToken();
  if (token) {
    return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  const cookieStore = cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore, middleware refreshes.
        }
      },
    },
  });
}
