"use client";

import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import { REMEMBER_COOKIE, rememberFromValue, withRemember } from "./remember";

/**
 * Browser Supabase client. Auth cookies are written here (sign-in, token
 * refresh); they honour the "stay signed in" choice — persistent by default,
 * browser-session cookies when it was unchecked at login.
 */
export function createClient() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const all = parse(document.cookie);
        return Object.entries(all).map(([name, value]) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        const remember = rememberFromValue(parse(document.cookie)[REMEMBER_COOKIE]);
        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serialize(name, value, withRemember(options, remember));
        }
      },
    },
  });
}
