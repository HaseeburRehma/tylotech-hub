import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { RunHeader } from "@/components/workflows/run-parts";
import { RunSteps } from "@/components/workflows/run-steps";
import { translate } from "@/lib/i18n/dictionary";
import { serverLocale } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listStaff, loadRuns } from "@/lib/workflows";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RunPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) notFound();
  const sb = createClient();
  const admin = createAdminClient();
  if (!sb || !admin) notFound();
  const [[run], staff] = await Promise.all([loadRuns(sb, { runId: params.id }), listStaff(admin)]);
  if (!run) notFound();
  const { data: client } = run.client_id
    ? await sb.from("clients").select("company,slug").eq("id", run.client_id).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/internal/processes" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {translate(serverLocale(), "wf.title")}
      </Link>
      <Card className="space-y-6 p-6">
        <RunHeader
          run={run}
          partner={client?.company ?? "—"}
          partnerHref={client ? `/internal/clients/${client.slug ?? run.client_id}` : undefined}
        />
        <RunSteps run={run} staff={staff} partner={client?.company ?? "—"} />
      </Card>
    </div>
  );
}
