"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { Run, StaffOption, Template } from "@/lib/workflows-shared";
import { RunCard, RunHeader } from "./run-parts";
import { RunSteps } from "./run-steps";
import { StartRunModal } from "./start-run-modal";

/** "Prozesse" tab in a partner record: same runs as the central board, filtered to this partner. */
export function PartnerProcesses({
  client,
  runs,
  templates,
  staff,
}: {
  client: { id: string; company: string };
  runs: Run[];
  templates: Template[];
  staff: StaffOption[];
}) {
  const t = useT();
  const [starting, setStarting] = useState(false);
  const open = runs.filter((r) => r.status !== "completed");
  const done = runs.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("wf.partnerHint", { partner: client.company })}</p>
        <Button size="sm" onClick={() => setStarting(true)} disabled={!templates.length}>
          <Plus className="h-4 w-4" /> {t("wf.startProcess")}
        </Button>
      </div>
      <StartRunModal open={starting} onClose={() => setStarting(false)} templates={templates} staff={staff} clients={[client]} fixedClientId={client.id} />

      {open.length === 0 && done.length === 0 && <Card className="py-12 text-center text-sm text-muted">{t("wf.noRunsPartner")}</Card>}

      {open.map((r) => (
        <Card key={r.id} className="space-y-6 p-6">
          <RunHeader run={r} partner={client.company} />
          <RunSteps run={r} staff={staff} />
        </Card>
      ))}

      {done.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{t("wf.completedRuns")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {done.map((r) => (
              <RunCard key={r.id} run={r} partner={client.company} staff={staff} showPartner={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
