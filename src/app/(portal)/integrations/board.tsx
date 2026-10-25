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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { IntegrationProvider } from "@/lib/integrations/providers";
import { APP_TZ } from "@/lib/utils";

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
  meta: {
    accountId?: string;
    siteUrl?: string;
    propertyId?: string;
    tokenOwner?: "client" | "staff";
    lastError?: "auth" | "api";
    lastErrorDetail?: string | null;
    tokenExpiresAt?: string;
  } | null;
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
  clients: { id: string; company: string; slug: string | null }[];
  isStaff: boolean;
  liveProviders: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  // Result of the OAuth round-trip (?connected= / ?error=), shown once, then
  // stripped from the URL so a reload doesn't repeat it.
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    setNotice(
      connected
        ? { ok: true, text: t("integ.connectedOk", { name: providerName(connected) }) }
        : {
            ok: false,
            // Known codes get a clear message; anything else names the provider's
            // own code so it can be looked up instead of a bare "didn't work".
            text: t(`integ.err.${error}`) === `integ.err.${error}` ? t("integ.err.unknown", { code: String(error).slice(0, 40) }) : t(`integ.err.${error}`),
          },
    );
    const keep = new URLSearchParams(params.toString());
    keep.delete("connected");
    keep.delete("error");
    router.replace(keep.toString() ? `${pathname}?${keep}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    return { ok: !!res?.ok, data };
  }

  const rowFor = (id: string) => rows.find((r) => r.provider === id);

  async function act(providerId: string, action: "connect" | "disconnect") {
    if (action === "disconnect" && confirmDisconnect !== providerId) {
      setConfirmDisconnect(providerId);
      return;
    }
    setConfirmDisconnect(null);
    setBusy(providerId);
    const { ok, data } = await post(`/api/integrations/${providerId}`, { action, clientId });
    setBusy(null);
    setNotice(
      ok
        ? { ok: true, text: t(action === "connect" ? "integ.connectedOk" : "integ.disconnectedOk", { name: providerName(providerId) }) }
        : { ok: false, text: data.error ?? t("integ.err.generic") },
    );
    router.refresh();
  }

  async function sync(providerId?: string) {
    setBusy(providerId ?? "all");
    const { ok, data } = await post("/api/integrations/sync", { clientId, provider: providerId });
    setBusy(null);
    if (!ok) {
      setNotice({ ok: false, text: data.error ?? t("integ.err.generic") });
    } else {
      const results = (data.results ?? []) as { provider: string; synced: boolean; reason?: string }[];
      const failed = results.filter((r) => !r.synced);
      setNotice({
        ok: failed.length === 0,
        text: [
          t("integ.syncedCount", { n: results.length - failed.length, total: results.length }),
          ...failed.map(
            (r) =>
              `${providerName(r.provider)}: ${
                r.reason?.startsWith("token") ? t("integ.needsReconnect") : r.reason?.startsWith("empty") ? t("integ.noActivity") : r.reason?.startsWith("provider") ? t("integ.providerError") : t("integ.noNewData")
              }`,
          ),
        ].join(" · "),
      });
    }
    router.refresh();
  }

  async function syncAllClients() {
    setBusy("all-clients");
    const { ok, data } = await post("/api/integrations/sync-all");
    setBusy(null);
    setNotice(ok ? { ok: true, text: t("integ.syncAllDone") } : { ok: false, text: data.error ?? t("integ.err.generic") });
    router.refresh();
  }

  async function configure(providerId: string, field: "accountId" | "siteUrl" | "propertyId" | "accessToken", value: string) {
    const { ok, data } = await post(`/api/integrations/${providerId}`, { action: "configure", clientId, [field]: value });
    setNotice(ok ? { ok: true, text: t("integ.savedSetting") } : { ok: false, text: data.error ?? t("integ.err.generic") });
    router.refresh();
  }

  const anyConnected = rows.some((r) => r.status === "connected");

  return (
    <div className="space-y-5">
      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label={t("widget.close")}>
            ×
          </button>
        </div>
      )}
      {isStaff && clients.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">{t("integ.managingFor")}</span>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {clients.map((c) => (
            <a
              key={c.id}
              href={`/integrations?client=${c.slug ?? c.id}`}
              className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-body-sm transition-colors ${
                c.id === clientId
                  ? "border-brand bg-brand/10 font-medium text-foreground"
                  : "border-border bg-surface text-soft shadow-card hover:text-foreground"
              }`}
            >
              {c.company}
            </a>
          ))}
          </div>
        </div>
      )}

      {(anyConnected || isStaff) && (
        <div className="flex flex-wrap justify-end gap-2">
          {isStaff && (
            <Button size="sm" variant="secondary" loading={busy === "all-clients"} onClick={syncAllClients}>
              <RefreshCw className="h-4 w-4" /> {t("integ.syncAllClients")}
            </Button>
          )}
          {anyConnected && (
            <Button size="sm" variant="secondary" loading={busy === "all"} onClick={() => sync()}>
              <RefreshCw className="h-4 w-4" /> {t("integ.syncAll")}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {providers.map((p, i) => {
          const Icon = ICONS[p.id] ?? Plug;
          const row = rowFor(p.id);
          const connected = row?.status === "connected";
          // A manual-connect slot without a token, or Google Ads without the
          // server's developer token, can't pull data — don't call it connected.
          const notLive = connected && (!row?.has_token || (p.id === "google_ads" && !liveProviders.includes(p.id)));
          const canEditTarget = isStaff || row?.meta?.tokenOwner === "client";
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={`flex h-full flex-col p-5 ${connected && !notLive ? "border-positive/30 ring-1 ring-positive/10" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line ${
                        connected ? "bg-surface text-brand-ink" : "bg-bg text-muted"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-title font-semibold">{p.name}</h3>
                        <span className="eyebrow rounded bg-line px-1.5 py-px">{p.category}</span>
                      </div>
                    </div>
                  </div>
                  {notLive ? (
                    <Badge variant="warning">{t("integ.notLive")}</Badge>
                  ) : connected ? (
                    <Badge variant="positive" className="shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {t("common.connected")}
                    </Badge>
                  ) : row?.status === "error" ? (
                    <Badge variant="danger">{t("integ.reconnectBadge")}</Badge>
                  ) : (
                    <Badge variant="neutral" className="shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted/50" /> {t("integ.notConnected")}
                    </Badge>
                  )}
                </div>

                <p className="mt-2 text-body-sm text-soft">{p.description}</p>
                {notLive && (
                  <p className="mt-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-caption text-warning">
                    {t(row?.has_token ? "integ.notLiveDevToken" : "integ.notLiveNoToken")}
                  </p>
                )}
                {isStaff && row?.meta?.lastErrorDetail && (
                  <p className="mt-2 rounded-lg bg-danger/10 px-2.5 py-1.5 text-caption text-danger">
                    {t("integ.lastErrorDetail", { detail: row.meta.lastErrorDetail })}
                  </p>
                )}
                {isStaff && row?.meta?.tokenExpiresAt && (
                  <p className={`mt-2 text-caption ${Date.parse(row.meta.tokenExpiresAt) - Date.now() < 7 * 86_400_000 ? "text-warning" : "text-muted"}`}>
                    {t("integ.tokenExpires", {
                      date: new Date(row.meta.tokenExpiresAt).toLocaleDateString("de-DE", { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" }),
                    })}
                  </p>
                )}

                {connected && (
                  <div className="mt-3">
                    {!canEditTarget && (
                      <p className="mb-2 text-caption text-muted/80">{t("integrations.managedByTeam")}</p>
                    )}
                    {p.id === "meta_ads" && (
                      <label className="block font-mono text-eyebrow text-muted">
                        {t("integrations.metaAccountId")}
                        <input
                          defaultValue={row?.meta?.accountId ?? ""}
                          readOnly={!canEditTarget}
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          onBlur={(e) => canEditTarget && e.target.value !== (row?.meta?.accountId ?? "") && configure(p.id, "accountId", e.target.value)}
                          placeholder="act_1234567890"
                          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs text-foreground outline-none field-focus read-only:opacity-70"
                        />
                      </label>
                    )}
                    {p.id === "google_ads" && (
                      <label className="block font-mono text-eyebrow text-muted">
                        {t("integrations.googleCustomerId")}
                        <input
                          defaultValue={row?.meta?.accountId ?? ""}
                          readOnly={!canEditTarget}
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          onBlur={(e) => canEditTarget && e.target.value !== (row?.meta?.accountId ?? "") && configure(p.id, "accountId", e.target.value)}
                          placeholder="123-456-7890"
                          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs text-foreground outline-none field-focus read-only:opacity-70"
                        />
                      </label>
                    )}
                    {p.id === "ga4" && (
                      <label className="block font-mono text-eyebrow text-muted">
                        {t("integrations.ga4PropertyId")} <span className="text-muted/60">{t("integrations.ga4Hint")}</span>
                        <input
                          defaultValue={row?.meta?.propertyId ?? ""}
                          readOnly={!canEditTarget}
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          onBlur={(e) => canEditTarget && e.target.value !== (row?.meta?.propertyId ?? "") && configure(p.id, "propertyId", e.target.value)}
                          placeholder="123456789"
                          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs text-foreground outline-none field-focus read-only:opacity-70"
                        />
                      </label>
                    )}
                    {p.id === "search_console" && (
                      <label className="block font-mono text-eyebrow text-muted">
                        {t("integrations.siteUrl")}
                        <input
                          defaultValue={row?.meta?.siteUrl ?? ""}
                          readOnly={!canEditTarget}
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          onBlur={(e) => canEditTarget && e.target.value !== (row?.meta?.siteUrl ?? "") && configure(p.id, "siteUrl", e.target.value)}
                          placeholder="https://example.com/"
                          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs text-foreground outline-none field-focus"
                        />
                      </label>
                    )}
                    {isStaff && (
                      <label className="mt-3 block font-mono text-eyebrow text-muted">
                        {t("integ.apiToken")} {row?.has_token ? <span className="text-success">· {t("integ.tokenSet")}</span> : null}
                        {/* Saved only on Enter — never on blur: browsers autofill password-type
                            fields with the user's login, which must never become an API token. */}
                        <input
                          type="password"
                          name={`api-token-${p.id}`}
                          autoComplete="new-password"
                          data-1p-ignore
                          data-lpignore="true"
                          defaultValue=""
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const v = e.currentTarget.value.trim();
                            if (v) {
                              configure(p.id, "accessToken", v);
                              e.currentTarget.value = "";
                            }
                          }}
                          placeholder={row?.has_token ? t("integ.tokenReplacePh") : t("integ.tokenPh")}
                          className="mt-1 h-9 w-full rounded-lg border border-line bg-bg px-3 font-mono text-xs text-foreground outline-none field-focus"
                        />
                        <span className="mt-1 block text-eyebrow text-muted/70">{t("integ.tokenEnterHint")}</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Spacer keeps the footer on the bottom edge when cards in a row differ in height. */}
                <div className="flex-1" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="text-xs text-muted">
                    {connected
                      ? row?.last_synced_at
                        ? t("integ.syncedAt", { date: new Date(row.last_synced_at).toLocaleString("de-DE", { timeZone: APP_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })
                        : row?.account_label ?? t("common.connected")
                      : t("integ.pullLive")}
                  </span>
                  <div className="flex gap-2">
                    {connected ? (
                      <>
                        <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => sync(p.id)}>
                          <RefreshCw className="h-4 w-4" /> {t("common.sync")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act(p.id, "disconnect")}
                          onBlur={() => setConfirmDisconnect((c) => (c === p.id ? null : c))}
                          className={confirmDisconnect === p.id ? "font-semibold text-negative" : "text-negative hover:bg-negative/10 hover:text-negative"}
                        >
                          {confirmDisconnect === p.id ? t("integ.confirmDisconnect") : t("common.disconnect")}
                        </Button>
                      </>
                    ) : liveProviders.includes(p.id) ? (
                      <ButtonLink
                        href={`/api/integrations/${p.id}/oauth/start${clientId ? `?clientId=${clientId}` : ""}`}
                       size="sm" disabled={!clientId}>{t("common.connect")}</ButtonLink>
                    ) : isStaff ? (
                      <Button size="sm" loading={busy === p.id} onClick={() => act(p.id, "connect")} disabled={!clientId}>
                        {t("common.connect")}
                      </Button>
                    ) : (
                      <span className="text-caption text-muted">{t("ob.viaTeam")}</span>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {!clientId && (
        <p className="text-center text-sm text-muted">{t("integ.noClient")}</p>
      )}
    </div>
  );
}
