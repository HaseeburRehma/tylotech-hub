import { NextResponse } from "next/server";
import { getAuthUser, isStaff, type AuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Staff-only guard shared by all workflow routes; returns the admin client for writes. */
export async function staffContext() {
  const user = await getAuthUser();
  if (!isStaff(user)) return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) } as const;
  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ error: "Backend not configured." }, { status: 503 }) } as const;
  return { user: user as AuthUser, admin } as const;
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Postgres errors raised by the engine functions → friendly API errors. */
export function engineError(message: string) {
  if (/not active/.test(message)) return bad("This step can't be changed right now — refresh to see the latest state.", 409);
  if (/not finished/.test(message)) return bad("Only finished steps can be reopened.", 409);
  if (/not found/.test(message)) return bad("Step not found.", 404);
  return bad(message, 400);
}
