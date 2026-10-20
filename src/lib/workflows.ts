import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStepAssignedEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notify";
import { inBackground } from "@/lib/background";

/**
 * Workflows ("Prozesse") — generic, template-driven process engine.
 * Data model + invariants: supabase/migrations/0036_workflows.sql.
 * The check-off/advance itself runs in the database (workflow_advance) under a
 * row lock; this module wraps it with permissions, notifications and reads.
 */

export * from "@/lib/workflows-shared";
import type { RunStatus, RunStep, Run, StaffOption, Template, TemplateStep } from "@/lib/workflows-shared";
import { addInterval, berlinToday } from "@/lib/workflows-shared";

/**
 * Active TyloTech staff. Same for every staff member and read on most internal
 * pages, so it's cached (cache-aside, 5 min) and invalidated with
 * revalidateTag(STAFF_TAG) whenever someone joins, leaves or changes name/title.
 */
export const STAFF_TAG = "staff-list";
const cachedStaff = unstable_cache(
  async (): Promise<StaffOption[]> => {
    const admin = createAdminClient();
    if (!admin) return [];
    const { data } = await admin.from("users").select("*").in("role", ["admin", "team"]).order("name");
    return ((data ?? []) as any[]).filter((u) => !u.deactivated_at).map((u) => ({ id: u.id, name: u.name, title: u.title ?? null, role: u.role }));
  },
  ["staff-list-v1"],
  { revalidate: 300, tags: [STAFF_TAG] },
);

/** The argument is kept for existing callers; the cached read uses the service role. */
export async function listStaff(_admin?: SupabaseClient): Promise<StaffOption[]> {
  return cachedStaff();
}

const ddmm = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : null;

/** "Du bist dran: [Step] bei [Partner]" — in-app (+ push via notifyUser) and email. */
export async function notifyStepActive(admin: SupabaseClient, stepId: string, actorId?: string, opts: { email?: boolean } = {}) {
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
  if (opts.email === false) return;
  const assignee = step.assignee_user_id;
  // The email (Resend round trip) goes out after the response.
  inBackground("step-email", async () => {
    const { data: u } = await admin.from("users").select("email").eq("id", assignee).maybeSingle();
    const { data: au } = await admin.auth.admin.getUserById(assignee);
    if (!u?.email || au?.user?.user_metadata?.notify_email === false) return;
    await sendStepAssignedEmail(u.email, {
      step: step.title,
      process: run?.name ?? "Prozess",
      partner: company,
      due: ddmm(step.due_date),
      path,
      instructions: step.instructions,
    }).catch(() => false);
  });
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
  const build = (select: string) => {
    let q = sb.from("workflow_runs").select(select).order("started_at", { ascending: false }).limit(200);
    if (filter.clientId) q = q.eq("client_id", filter.clientId);
    if (filter.runId) q = q.eq("id", filter.runId);
    if (filter.status?.length) q = q.in("status", filter.status);
    return q;
  };
  // With attachments (0041) and client approvals (0042); fall back on older databases.
  let { data, error } = await build("*, workflow_run_steps(*, workflow_step_attachments(*), workflow_approvals(*))");
  if (error) ({ data, error } = await build("*, workflow_run_steps(*, workflow_step_attachments(*))"));
  if (error) ({ data, error } = await build("*, workflow_run_steps(*)"));
  if (error) return [];
  return ((data ?? []) as any[]).map(({ workflow_run_steps, ...r }) => ({
    ...r,
    steps: ((workflow_run_steps ?? []) as any[])
      .map(({ workflow_step_attachments, workflow_approvals, ...s }) => ({
        ...s,
        attachments: ((workflow_step_attachments ?? []) as any[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
        approvals: ((workflow_approvals ?? []) as any[]).sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
      }))
      .sort((a, b) => a.order_index - b.order_index) as RunStep[],
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

/**
 * Start the next round of a run: same steps, people and offsets; step 1 active.
 * Step 1's deadline moves on by the repeat interval (one week when the run has
 * no interval), or comes from its day offset. Returns the new run id.
 */
export async function repeatRun(admin: SupabaseClient, runId: string, actorId: string): Promise<string | null> {
  const [prev] = await loadRuns(admin, { runId });
  if (!prev || !prev.steps.length) return null;
  const every = prev.repeat_every ?? "week";
  const today = berlinToday();
  const first = prev.steps[0]!;
  const firstDue =
    first.due_date != null
      ? (() => {
          // Move the previous deadline forward until it's no longer in the past.
          let d = addInterval(first.due_date, every);
          while (d < today) d = addInterval(d, every);
          return d;
        })()
      : first.due_offset_days != null
        ? addDays(today, first.due_offset_days)
        : null;

  const base = {
    template_id: prev.template_id,
    name: prev.name,
    context_type: prev.context_type,
    context_id: prev.context_id,
    client_id: prev.client_id,
    started_by: actorId,
  };
  let ins = await admin
    .from("workflow_runs")
    .insert({ ...base, repeat_every: prev.repeat_every ?? null, repeated_from: prev.id, iteration: (prev.iteration ?? 1) + 1 })
    .select("id")
    .single();
  if (ins.error && /repeat_every|repeated_from|iteration/i.test(ins.error.message)) {
    ins = await admin.from("workflow_runs").insert(base).select("id").single();
  }
  if (ins.error || !ins.data) return null;
  const newId = ins.data.id as string;

  const rows = prev.steps.map((s, i) => ({
    run_id: newId,
    template_step_id: s.template_step_id ?? null,
    order_index: i,
    title: s.title,
    instructions: s.instructions,
    assignee_user_id: s.assignee_user_id,
    status: i === 0 ? "active" : "locked",
    due_offset_days: s.due_offset_days ?? null,
    due_date: i === 0 ? firstDue : null,
    activated_at: i === 0 ? new Date().toISOString() : null,
  }));
  const { data: inserted, error } = await admin.from("workflow_run_steps").insert(rows).select("id,order_index");
  if (error || !inserted) {
    await admin.from("workflow_runs").delete().eq("id", newId);
    return null;
  }
  const step1 = inserted.find((s) => s.order_index === 0);
  if (step1) await notifyStepActive(admin, step1.id, actorId).catch(() => {});
  return newId;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
