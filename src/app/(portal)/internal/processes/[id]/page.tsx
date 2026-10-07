import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { RunHeader } from "@/components/workflows/run-parts";
import { RunSteps } from "@/components/workflows/run-steps";
import { LOCALE_COOKIE, translate } from "@/lib/i18n/dictionary";
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
        <ArrowLeft className="h-4 w-4" /> {translate(cookies().get(LOCALE_COOKIE)?.value === "en" ? "en" : "de", "wf.title")}
      </Link>
      <Card className="space-y-6 p-6">
        <RunHeader
          run={run}
          partner={client?.company ?? "—"}
          partnerHref={client ? `/internal/clients/${client.slug ?? run.client_id}` : undefined}
        />
        <RunSteps run={run} staff={staff} />
      </Card>
    </div>
  );
}
