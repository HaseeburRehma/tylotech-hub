"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Panel, PanelHeader } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Figma "Connections per client": one row per client, one column per source,
 * a tick where that source is connected and a count of what's still missing.
 */
export function ConnectionsMatrix({
  clients,
  providers,
  rows,
  activeClientId,
}: {
  clients: { id: string; company: string; slug: string | null }[];
  providers: { id: string; name: string }[];
  rows: { client_id: string; provider: string; status: string }[];
  activeClientId: string | null;
}) {
  const t = useT();
  const connected = new Set(rows.filter((r) => r.status === "connected").map((r) => `${r.client_id}:${r.provider}`));
  const missingFor = (id: string) => providers.filter((p) => !connected.has(`${id}:${p.id}`)).length;
  const totalMissing = clients.reduce((a, c) => a + missingFor(c.id), 0);

  return (
    <Panel>
      <PanelHeader title={t("integ.matrixTitle")} subtitle={t("integ.matrixSub")} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th">{t("clients.col.client")}</th>
              {providers.map((p) => (
                <th key={p.id} className="th text-center">
                  {p.name}
                </th>
              ))}
              <th className="th text-right">{t("integ.matrixMissing")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {clients.map((c) => {
              const missing = missingFor(c.id);
              return (
                <tr key={c.id} className={cn("hover:bg-bg/60", c.id === activeClientId && "bg-brand/5")}>
                  <td className="px-4 py-2.5">
                    <Link href={`/integrations?client=${c.slug ?? c.id}`} className="font-medium text-foreground hover:underline">
                      {c.company}
                    </Link>
                  </td>
                  {providers.map((p) => {
                    const on = connected.has(`${c.id}:${p.id}`);
                    return (
                      <td key={p.id} className="px-4 py-2.5 text-center">
                        <span
                          aria-label={on ? t("common.connected") : t("integ.notConnected")}
                          className={cn(
                            "inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border",
                            on ? "border-positive bg-positive/10 text-positive" : "border-border",
                          )}
                        >
                          {on && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right">
                    {missing > 0 ? (
                      <span className="rounded-md bg-brand/10 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {t("integ.matrixOf", { n: missing, total: providers.length })}
                      </span>
                    ) : (
                      <Check className="ml-auto h-4 w-4 text-positive" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        {t("integ.matrixFooter", { n: clients.length, missing: totalMissing })}
      </p>
    </Panel>
  );
}
