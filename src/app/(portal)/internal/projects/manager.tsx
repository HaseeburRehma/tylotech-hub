"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PROJECT_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/types";
import type { TeamMember } from "@/lib/data";

const STATUSES: ProjectStatus[] = ["planning", "in_progress", "review", "done", "blocked"];

export function ProjectsManager({
  projects,
  clients,
  members,
}: {
  projects: Project[];
  clients: { id: string; company: string }[];
  members: TeamMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: clients[0]?.id ?? "",
    name: "",
    assignedToId: members[0]?.id ?? "",
    status: "planning" as ProjectStatus,
    progress: "0",
    due: "",
  });

  const clientName = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.company])),
    [clients],
  );
  const memberName = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members],
  );

  async function create() {
    if (!form.name.trim() || !form.clientId) {
      setError("Client and project name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: form.clientId,
        name: form.name,
        status: form.status,
        progress: form.progress,
        assignedToId: form.assignedToId,
        assignedToName: memberName[form.assignedToId] ?? null,
        due: form.due,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create project.");
      return;
    }
    setOpen(false);
    setForm((f) => ({ ...f, name: "", progress: "0", due: "" }));
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{projects.length} projects</Badge>
        <Button size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {open ? "Cancel" : "New project"}
        </Button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-6">
              {error && (
                <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="pname">Project name</Label>
                  <Input id="pname" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Q3 Meta Ads Scaling" />
                </div>
                <div>
                  <Label htmlFor="pclient">Client</Label>
                  <select id="pclient" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className="input-base appearance-none">
                    {clients.map((c) => (
                      <option key={c.id} value={c.id} className="bg-surface">{c.company}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="passignee">Assign to</Label>
                  <select id="passignee" value={form.assignedToId} onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))} className="input-base appearance-none">
                    {members.map((m) => (
                      <option key={m.id} value={m.id} className="bg-surface">{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="pstatus">Status</Label>
                  <select id="pstatus" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))} className="input-base appearance-none">
                    {STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-surface">{PROJECT_STATUS[s].label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pprog">Progress %</Label>
                    <Input id="pprog" type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="pdue">Due</Label>
                    <Input id="pdue" type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={create} loading={saving}>Create project</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="p-2">
        {projects.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No projects yet. Create your first one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="p-3 font-medium">Project</th>
                  <th className="p-3 font-medium">Client</th>
                  <th className="p-3 font-medium">Assignee</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Progress</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const s = PROJECT_STATUS[p.status];
                  const assignee = p.assigned_to_id ? memberName[p.assigned_to_id] ?? p.assigned_to : p.assigned_to;
                  return (
                    <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-surface-2/50">
                      <td className="p-3 font-medium text-foreground">{p.name}</td>
                      <td className="p-3 text-muted">{clientName[p.client_id] ?? "—"}</td>
                      <td className="p-3">
                        <select
                          value={p.assigned_to_id ?? ""}
                          onChange={(e) =>
                            patch(p.id, { assignedToId: e.target.value, assignedToName: memberName[e.target.value] ?? null })
                          }
                          className="rounded-lg border border-border bg-bg/60 px-2 py-1.5 text-xs outline-none focus:border-brand/50"
                        >
                          <option value="" className="bg-surface">Unassigned</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id} className="bg-surface">{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={p.status}
                          onChange={(e) => patch(p.id, { status: e.target.value })}
                          className={cn(
                            "rounded-lg border border-border bg-bg/60 px-2 py-1.5 text-xs outline-none focus:border-brand/50",
                          )}
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st} className="bg-surface">{PROJECT_STATUS[st].label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={p.progress} tone={s.tone} className="w-24" />
                          <input
                            type="number"
                            defaultValue={p.progress}
                            min={0}
                            max={100}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== p.progress) patch(p.id, { progress: v });
                            }}
                            className="w-14 rounded-lg border border-border bg-bg/60 px-2 py-1 text-xs outline-none focus:border-brand/50"
                          />
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => remove(p.id)}
                          className="text-muted transition-colors hover:text-danger"
                          aria-label="Delete project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted">
        <Avatar name="Team" size={20} /> Assignees are pulled from your TyloTech team members.
      </p>
    </div>
  );
}
