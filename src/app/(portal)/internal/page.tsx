import { cookies } from "next/headers";
import { listClientHealth, listClients, listProjects, listTeamLoad } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE } from "@/lib/i18n/dictionary";
import { InternalView, type PipelineColumn } from "./view";
import type { ProjectStatus } from "@/types";

const STAGES: { key: ProjectStatus; label: string }[] = [
  { key: "planning", label: "Planning" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

export default async function InternalPage() {
  const [clients, team, projects, health] = await Promise.all([
    listClients(),
    listTeamLoad(),
    listProjects(),
    listClientHealth(),
  ]);

  const companyById = Object.fromEntries(clients.map((c) => [c.id, c.company]));
  const colorById = Object.fromEntries(clients.map((c) => [c.id, c.primary_color]));

  // "Blocked" only gets a column when something is actually blocked.
  const stages = STAGES.filter((s) => s.key !== "blocked" || projects.some((p) => p.status === "blocked"));
  const pipeline: PipelineColumn[] = stages.map((s) => ({
    stage: s.label,
    stageKey: s.key,
    projects: projects
      .filter((p) => p.status === s.key)
      .map((p) => ({
        name: p.name,
        client: companyById[p.client_id] ?? "—",
        clientColor: colorById[p.client_id] ?? "#888888",
        assignee: p.assigned_to ?? "",
        due: p.due ?? "",
      })),
  }));

  // MRR per month from the recorded history (each client's latest MRR change on
  // or before that month's end). Clients without history rows (pre-0028) fall
  // back to their current MRR from their start date.
  const sb = createClient();
  const { data: historyRows } = sb
    ? await sb.from("client_mrr_history").select("client_id,mrr,effective_from").order("effective_from")
    : { data: null };
  const history = new Map<string, { mrr: number; from: string }[]>();
  for (const h of (historyRows ?? []) as { client_id: string; mrr: number; effective_from: string }[]) {
    const list = history.get(h.client_id) ?? [];
    list.push({ mrr: Number(h.mrr), from: h.effective_from });
    history.set(h.client_id, list);
  }
  const mrrAt = (c: (typeof clients)[number], monthEnd: string) => {
    const rows = history.get(c.id);
    if (!rows?.length) return c.created_at.slice(0, 10) <= monthEnd ? c.mrr ?? 0 : 0;
    let value = 0;
    for (const r of rows) if (r.from <= monthEnd) value = r.mrr;
    return value;
  };

  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = cookieLocale === "en" ? "en-GB" : "de-DE";
  const now = new Date();
  const mrrSeries = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i) + 1, 0)); // end of that month
    const monthEnd = d.toISOString().slice(0, 10);
    const mrr = clients.reduce((a, c) => a + mrrAt(c, monthEnd), 0);
    return { month: d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }), mrr };
  });

  return (
    <InternalView
      clients={clients}
      team={team}
      pipeline={pipeline}
      mrrSeries={mrrSeries}
      projectCount={projects.length}
      health={health}
    />
  );
}
