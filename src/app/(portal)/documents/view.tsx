"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { DocItem } from "@/types";
import { useT } from "@/lib/i18n/provider";

export function DocumentsView({
  documents,
  clientId,
}: {
  documents: DocItem[];
  clientId: string | null;
}) {
  const t = useT();
  return (
    <div className="space-y-6">
      <PageHeader title={t("docs.title")} subtitle={t("docs.subtitle")} />
      <DocumentsPanel documents={documents} clientId={clientId} />
    </div>
  );
}
