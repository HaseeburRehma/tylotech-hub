"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Check,
  Megaphone,
  Plug,
  RefreshCw,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { IntegrationProvider } from "@/lib/integrations/providers";

const ICONS: Record<string, LucideIcon> = {
  meta_ads: Megaphone,
  google_ads: Megaphone,
  ga4: BarChart3,
  search_console: Search,
};

interface Row {
  provider: string;
  status: string;
  account_label: string | null;
  last_synced_at: string | null;
  has_token?: boolean;
  meta: { metrics?: Record<string, number>; accountId?: string; siteUrl?: string; propertyId?: string } | null;
}

function fmt(unit: string, v: number) {
  if (unit === "currency") return formatCurrency(v);
  if (unit === "ratio") return `${v.toFixed(1)}x`;
  if (unit === "percent") return `${v}%`;
  return new Intl.NumberFormat("en").format(v);
}

export function IntegrationsBoard({
  providers,
  rows,
  clientId,
  clients,
  isStaff,
  liveProviders,
}: {
  providers: IntegrationProvider[];
  rows: Row[];
  clientId: string | null;
  clients: { id: string; company: string }[];
  isStaff: boolean;
  liveProviders: string[];
}) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);

  const rowFor = (id: string) => rows.find((r) => r.provider === id);

  async function act(providerId: string, action: "connect" | "disconnect") {
    setBusy(providerId);
    await fetch(`/api/integrations/${providerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, clientId }),
    });
    setBusy(null);
    router.refresh();
  }

  async function sync(providerId?: string) {
    setBusy(providerId ?? "all");
    await fetch("/api/integrations/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, provider: providerId }),
    });
    setBusy(null);
    router.refresh();
  }

  async function configure(providerId: string, field: "accountId" | "siteUrl" | "propertyId" | "accessToken", value: string) {
    await fetch(`/api/integrations/${providerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "configure", clientId, [field]: value }),
    });
    router.refresh();
  }

  const anyConnected = rows.some((r) => r.status === "connected");

  return (
    <div className="space-y-5">
      {isStaff && clients.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Managing for:</span>
          {clients.map((c) => (
            <a
              key={c.id}
              href={`/integrations?client=${c.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                c.id === clientId
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {c.company}
            </a>
          ))}
        </div>
      )}

      {anyConnected && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" loading={busy === "all"} onClick={() => sync()}>
            <RefreshCw className="h-4 w-4" /> {t("integ.syncAll")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {providers.map((p, i) => {
          const Icon = ICONS[p.id] ?? Plug;
          const row = rowFor(p.id);
          const connected = row?.status === "connected";
          const metrics = row?.meta?.metrics;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                        connected ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{p.name}</h3>
                      <Badge variant="outline" className="mt-0.5">{p.category}</Badge>
                    </div>
                  </div>
                  {connected ? (
                    <Badge variant="success" className="gap-1">
                      <Check className="h-3 w-3" /> {t("common.connected")}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">{t("integ.notConnected")}</Badge>
                  )}
                </div>

                <p className="mt-3 text-sm text-muted">{p.description}</p>

                {connected && (
                  <div className="mt-3">
                    {p.id === "meta_ads" && (
                      <label className="block text-[11px] text-muted">
                        Ad account ID
                        <input
                          defaultValue={row?.meta?.accountId ?? ""}
                          onBlur={(e) => e.target.value !== (row?.meta?.accountId ?? "") && configure(p.id, "accountId", e.target.value)}
                          placeholder="act_1234567890"
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg/60 px-2.5 text-xs text-foreground outline-none focus:border-brand/50"
                        />
                      </label>
                    )}
                    {p.id === "google_ads" && (
                      <label className="block text-[11px] text-muted">
                        Customer ID
                        <input
                          defaultValue={row?.meta?.accountId ?? ""}
                          onBlur={(e) => e.target.value !== (row?.meta?.accountId ?? "") && configure(p.id, "accountId", e.target.value)}
                          placeholder="123-456-7890"
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg/60 px-2.5 text-xs text-foreground outline-none focus:border-brand/50"
                        />
                      </label>
                    )}
                    {p.id === "ga4" && (
                      <label className="block text-[11px] text-muted">
                        GA4 Property ID <span className="text-muted/60">(numeric — Admin → Property Settings)</span>
                        <input
                          defaultValue={row?.meta?.propertyId ?? ""}
                          onBlur={(e) => e.target.value !== (row?.meta?.propertyId ?? "") && configure(p.id, "propertyId", e.target.value)}
                          placeholder="123456789"
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg/60 px-2.5 text-xs text-foreground outline-none focus:border-brand/50"
                        />
                      </label>
                    )}
                    {p.id === "search_console" && (
                      <label className="block text-[11px] text-muted">
                        Property / site URL
                        <input
                          defaultValue={row?.meta?.siteUrl ?? ""}
                          onBlur={(e) => e.target.value !== (row?.meta?.siteUrl ?? "") && configure(p.id, "siteUrl", e.target.value)}
                          placeholder="https://example.com/"
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg/60 px-2.5 text-xs text-foreground outline-none focus:border-brand/50"
                        />
                      </label>
                    )}
                    {isStaff && (
                      <label className="mt-2 block text-[11px] text-muted">
                        API access token {row?.has_token ? <span className="text-success">· set ✓</span> : null}
                        <input
                          type="password"
                          defaultValue=""
                          onBlur={(e) => e.target.value && configure(p.id, "accessToken", e.target.value)}
                          placeholder={row?.has_token ? "•••••••• (paste to replace)" : "Paste access token for live data"}
                          className="mt-1 h-9 w-full rounded-lg border border-border bg-bg/60 px-2.5 text-xs text-foreground outline-none focus:border-brand/50"
                        />
                      </label>
                    )}
                  </div>
                )}

                {connected && metrics && (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-bg/40 p-3">
                    {p.metrics.map((m) => (
                      <div key={m.key}>
                        <p className="text-[10px] text-muted">{m.label}</p>
                        <p className="text-sm font-semibold text-foreground">
                          {metrics[m.key] != null ? fmt(m.unit, metrics[m.key]) : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-muted/70">
                    {connected
                      ? row?.last_synced_at
                        ? `Synced ${new Date(row.last_synced_at).toLocaleString("en-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                        : row?.account_label ?? t("common.connected")
                      : t("integ.pullLive")}
                  </span>
                  <div className="flex gap-2">
                    {connected ? (
                      <>
                        <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => sync(p.id)}>
                          <RefreshCw className="h-4 w-4" /> {t("common.sync")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act(p.id, "disconnect")}>
                          {t("common.disconnect")}
                        </Button>
                      </>
                    ) : liveProviders.includes(p.id) ? (
                      <a
                        href={`/api/integrations/${p.id}/oauth/start${clientId ? `?clientId=${clientId}` : ""}`}
                      >
                        <Button size="sm" disabled={!clientId}>{t("common.connect")}</Button>
                      </a>
                    ) : (
                      <Button size="sm" loading={busy === p.id} onClick={() => act(p.id, "connect")} disabled={!clientId}>
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {!clientId && (
        <p className="text-center text-sm text-muted">No client selected. Onboard a client first.</p>
      )}
    </div>
  );
}
