"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { DocItem } from "@/types";

export function DocumentsView({
  documents,
  clientId,
}: {
  documents: DocItem[];
  clientId: string | null;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Contracts, reports, invoices and brand assets — all in one place."
      />
      <DocumentsPanel documents={documents} clientId={clientId} />
    </div>
  );
}
