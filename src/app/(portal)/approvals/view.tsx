"use client";

import { ApprovalsList } from "@/components/approvals/approvals-list";
import { PageHeader } from "@/components/ui/page-header";
import { useT } from "@/lib/i18n/provider";
import type { Approval } from "@/lib/workflows-shared";

export function ApprovalsView({ approvals, unavailable }: { approvals: Approval[]; unavailable: boolean }) {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("approval.pageTitle")} subtitle={t("approval.pageSubtitle")} />
      {unavailable ? <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{t("approval.needsMigration")}</p> : <ApprovalsList approvals={approvals} />}
    </div>
  );
}
