import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  /** Dotted verb, e.g. "client.update", "team.create", "report.send". */
  action: string;
  clientId?: string | null;
  targetType?: string;
  targetId?: string | null;
  /** Short human summary — never secrets, passwords or message bodies. */
  summary?: string;
}

/**
 * Append one row to the staff audit log (migration 0034). Best-effort: an
 * audit failure must never fail the action itself, so errors are logged only.
 */
export async function logAudit(actor: Pick<AuthUser, "id" | "name"> | null, entry: AuditEntry, admin?: SupabaseClient | null) {
  const db = admin ?? createAdminClient();
  if (!db) return;
  const { error } = await db.from("audit_log").insert({
    actor_id: actor && actor.id !== "demo" ? actor.id : null,
    actor_name: actor?.name?.slice(0, 120) ?? "System",
    action: entry.action.slice(0, 60),
    client_id: entry.clientId ?? null,
    target_type: entry.targetType?.slice(0, 40) ?? null,
    target_id: entry.targetId?.slice(0, 80) ?? null,
    summary: entry.summary?.slice(0, 300) ?? null,
  });
  if (error) console.error("audit log write failed:", error.message);
}
