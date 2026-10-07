import type { SupabaseClient } from "@supabase/supabase-js";
import { sendStepAssignedEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notify";

/**
 * Workflows ("Prozesse") — generic, template-driven process engine.
 * Data model + invariants: supabase/migrations/0036_workflows.sql.
 * The check-off/advance itself runs in the database (workflow_advance) under a
 * row lock; this module wraps it with permissions, notifications and reads.
 */

export * from "@/lib/workflows-shared";
import type { RunStatus, RunStep, Run, StaffOption, Template, TemplateStep } from "@/lib/workflows-shared";

export async function listStaff(admin: SupabaseClient): Promise<StaffOption[]> {
  const { data } = await admin.from("users").select("*").in("role", ["admin", "team"]).order("name");
  return ((data ?? []) as any[]).filter((u) => !u.deactivated_at).map((u) => ({ id: u.id, name: u.name, title: u.title ?? null, role: u.role }));
}

const ddmm = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : null;

/** "Du bist dran: [Step] bei [Partner]" — in-app (+ push via notifyUser) and email. */
export async function notifyStepActive(admin: SupabaseClient, stepId: string, actorId?: string) {
  const { data: step } = await admin
    .from("workflow_run_steps")
    .select("id,title,instructions,due_date,assignee_user_id,run_id,workflow_runs(name,client_id,clients(company))")
    .eq("id", stepId)
    .maybeSingle();
  // Nobody needs an email about a step they just activated for themselves.
  if (!step?.assignee_user_id || step.assignee_user_id === actorId) return;
  const run = (Array.isArray(step.workflow_runs) ? step.workflow_runs[0] : step.workflow_runs) as any;
  const company = (Array.isArray(run?.clients) ? run.clients[0] : run?.clients)?.company ?? "—";
  const path = `/internal/processes/${step.run_id}`;
  await notifyUser(step.assignee_user_id, {
    title: `Du bist dran: ${step.title} bei ${company}`,
    body: run?.name ?? undefined,
    href: path,
    type: "workflow",
  });
  const { data: u } = await admin.from("users").select("email").eq("id", step.assignee_user_id).maybeSingle();
  const { data: au } = await admin.auth.admin.getUserById(step.assignee_user_id);
  if (u?.email && au?.user?.user_metadata?.notify_email !== false) {
    await sendStepAssignedEmail(u.email, {
      step: step.title,
      process: run?.name ?? "Prozess",
      partner: company,
      due: ddmm(step.due_date),
      path,
      instructions: step.instructions,
    }).catch(() => false);
  }
}

/** Tell whoever started the run that it's finished (skipped if they finished it themselves). */
export async function notifyRunCompleted(admin: SupabaseClient, runId: string, actorId: string) {
  const { data: run } = await admin.from("workflow_runs").select("name,started_by,clients(company)").eq("id", runId).maybeSingle();
  if (!run?.started_by || run.started_by === actorId) return;
  const company = (Array.isArray(run.clients) ? run.clients[0] : run.clients)?.company ?? "—";
  await notifyUser(run.started_by, {
    title: `Abgeschlossen: ${run.name} bei ${company}`,
    href: `/internal/processes/${runId}`,
    type: "workflow",
  });
}

/** Load runs (with their steps) for the board, a partner tab or one run. */
export async function loadRuns(
  sb: SupabaseClient,
  filter: { clientId?: string; runId?: string; status?: RunStatus[] } = {},
): Promise<Run[]> {
  let q = sb
    .from("workflow_runs")
    .select("*, workflow_run_steps(*)")
    .order("started_at", { ascending: false })
    .limit(200);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.runId) q = q.eq("id", filter.runId);
  if (filter.status?.length) q = q.in("status", filter.status);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as any[]).map(({ workflow_run_steps, ...r }) => ({
    ...r,
    steps: ((workflow_run_steps ?? []) as RunStep[]).sort((a, b) => a.order_index - b.order_index),
  }));
}

export async function loadTemplates(sb: SupabaseClient, opts: { includeArchived?: boolean } = {}): Promise<Template[]> {
  let q = sb.from("workflow_templates").select("*, workflow_template_steps(*)").order("name");
  if (!opts.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as any[]).map(({ workflow_template_steps, ...t }) => ({
    ...t,
    steps: ((workflow_template_steps ?? []) as TemplateStep[]).sort((a, b) => a.order_index - b.order_index),
  }));
}
