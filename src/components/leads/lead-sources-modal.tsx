"use client";

import { ArrowLeft, Check, Copy, ExternalLink, FlaskConical, Loader2, Plug, RefreshCw, Search, Settings2, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal";
import { useIntlLocale, useT } from "@/lib/i18n/provider";
import { LEAD_PROVIDERS, PROVIDER_BY_ID, type LeadProvider, type LeadProviderGroup, type LeadProviderId } from "@/lib/lead-providers";
import type { LeadSourceView } from "@/lib/leads-shared";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "./lead-bits";
import { ProviderLogo } from "./provider-logo";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: !!res?.ok, data, error: (data.error as string | undefined) ?? null };
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  const [shown, setShown] = useState(!secret);
  return (
    <div>
      <p className="mb-1 text-caption font-medium text-muted">{label}</p>
      <div className="flex items-center gap-1.5">
        <code
          onClick={() => setShown(true)}
          className={cn("min-w-0 flex-1 truncate rounded-lg border border-border bg-bg px-2.5 py-2 font-mono text-xs text-foreground", !shown && "cursor-pointer select-none blur-[3px]")}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          }}
          aria-label={label}
          className="rounded-lg border border-border p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

const GROUPS: ("all" | LeadProviderGroup)[] = ["all", "ads", "crm", "forms", "automation"];
const fullUrl = (s: LeadSourceView) => (s.hookUrl && s.key ? `${s.hookUrl}?key=${s.key}` : s.hookUrl ?? "");

/** How a connected source is doing: live, waiting for its first lead, or broken. */
function health(s: LeadSourceView): "live" | "waiting" | "error" {
  if (s.status === "error") return "error";
  if (s.provider === "google_sheet" && !s.sheet?.tabs.length) return "waiting";
  return s.last_received_at || (s.last_synced_at && s.provider !== "website") ? "live" : "waiting";
}

export function SourcesModal({
  clientId,
  company,
  staff,
  sources,
  metaReady,
  webhook,
  onClose,
  onChanged,
  onPickTabs,
}: {
  clientId: string;
  company?: string;
  staff: boolean;
  sources: LeadSourceView[];
  metaReady: boolean;
  webhook: { url: string; verifyToken: string | null } | null;
  onClose: () => void;
  onChanged: () => void;
  onPickTabs: (sourceId: string) => void;
}) {
  const t = useT();
  const de = useIntlLocale().startsWith("de");
  const tx = (x: { de: string; en: string }) => (de ? x.de : x.en);
  const [view, setView] = useState<LeadProviderId | null>(null);
  const [group, setGroup] = useState<"all" | LeadProviderGroup>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const scope = staff ? { clientId } : {};
  const qs = staff ? `?clientId=${clientId}` : "";

  const reset = () => {
    setError(null);
    setInfo(null);
  };
  const go = (id: LeadProviderId | null) => {
    reset();
    setToken("");
    setView(id);
  };

  const catalogue = useMemo(() => {
    const term = q.trim().toLowerCase();
    return LEAD_PROVIDERS.filter((p) => (group === "all" || p.group === group) && (!term || `${p.name} ${p.blurb.de} ${p.blurb.en}`.toLowerCase().includes(term))).sort(
      (a, b) => Number(!!b.popular) - Number(!!a.popular),
    );
  }, [q, group]);

  async function act(key: string, fn: () => Promise<{ ok: boolean; data: Record<string, unknown>; error: string | null }>, ok?: (d: Record<string, unknown>) => string | null) {
    setBusy(key);
    reset();
    const r = await fn();
    setBusy(null);
    if (!r.ok) {
      setError({ text: r.error ?? t("ait.actionFailed"), code: (r.data.code as string | undefined) ?? undefined });
      return null;
    }
    const msg = ok?.(r.data);
    if (msg) setInfo(msg);
    onChanged();
    return r.data;
  }

  const create = (p: LeadProvider, extra: Record<string, unknown> = {}) =>
    act(`create:${p.id}`, () => post("/api/leads/sources", { ...scope, provider: p.id, ...extra }), () => t("leads.hub.connectedOk", { name: p.name })).then((d) => {
      const id = (d?.source as { id?: string } | undefined)?.id;
      if (id) {
        setOpen(id);
        setToken("");
      }
    });

  const syncSource = (s: LeadSourceView) =>
    s.provider === "meta"
      ? act(`sync:${s.id}`, () => post("/api/leads/meta/sync", { ...scope, days: 30 }), (d) => t("leads.hub.synced", { n: Number(d.added ?? 0) }))
      : s.provider === "google_sheet"
        ? act(`sync:${s.id}`, () => post(`/api/leads/sheets/${s.id}`, {}), (d) => t("leads.sheet.imported", { added: Number(d.added ?? 0), updated: Number(d.updated ?? 0) }))
        : act(`sync:${s.id}`, () => post(`/api/leads/sources/${s.id}`, { action: "sync" }), (d) => t("leads.hub.synced", { n: Number(d.added ?? 0) }));

  const remove = (s: LeadSourceView) =>
    act(`rm:${s.id}`, async () => {
      const res = await fetch(`/api/leads/sources/${s.id}`, { method: "DELETE" }).catch(() => null);
      return { ok: !!res?.ok, data: {}, error: res?.ok ? null : t("ait.actionFailed") };
    }).then(() => setConfirmRemove(null));

  /** A real submission through the public URL, exactly as a form tool would send it. */
  const sendTest = (s: LeadSourceView) =>
    act(
      `test:${s.id}`,
      async () => {
        const body =
          s.provider === "google_ads_form"
            ? { google_key: s.key, is_test: true, lead_id: `test-${Date.now()}`, user_column_data: [{ column_name: "Full Name", string_value: "Test Lead" }, { column_name: "User Email", string_value: "test@example.com" }, { column_name: "User Phone", string_value: "+49 170 0000000" }] }
            : { name: "Test Lead", email: "test@example.com", phone: "+49 170 0000000", message: de ? "Testanfrage aus TyloHQ" : "Test enquiry from TyloHQ", is_test: true, lead_id: `test-${Date.now()}` };
        const res = await fetch(fullUrl(s), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
        const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
        return { ok: !!res?.ok, data, error: (data.error as string | undefined) ?? null };
      },
      (d) => t("leads.hub.testOk", { n: Number(d.lead_no ?? 0) }),
    );

  const banner = (
    <>
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <span className="flex-1">{error.text}</span>
          {(error.code === "not_connected" || error.code === "no_account") && (
            <ButtonLink href={`/integrations${staff ? `?client=${clientId}` : ""}`} size="sm" variant="secondary">
              <ExternalLink className="h-3.5 w-3.5" /> {t("leads.hub.openIntegrations")}
            </ButtonLink>
          )}
        </div>
      )}
      {info && <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">{info}</p>}
    </>
  );

  /* ─────────────── a connected source ─────────────── */
  const sourceRow = (s: LeadSourceView) => {
    const p = PROVIDER_BY_ID.get((s.provider ?? "website") as LeadProviderId) ?? PROVIDER_BY_ID.get("website")!;
    const h = health(s);
    const isOpen = open === s.id;
    const fetchable = ["meta", "google_sheet", "hubspot", "pipedrive", "google_ads"].includes(p.id);
    const hasSetup = !!s.hookUrl;
    return (
      <li key={s.id} className="rounded-2xl border border-border bg-surface transition-shadow hover:shadow-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
          <ProviderLogo provider={p} size={36} />
          <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{s.label}</p>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  h === "live" ? "bg-success/15 text-success" : h === "error" ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", h === "live" ? "bg-success" : h === "error" ? "bg-danger" : "bg-warning")} />
                {t(`leads.hub.${h}`)}
              </span>
            </div>
            <p className={cn("truncate text-caption", h === "error" ? "text-danger" : "text-muted")}>
              {h === "error"
                ? s.last_error ?? t("leads.src.error")
                : [
                    p.name !== s.label ? p.name : null,
                    s.provider === "google_sheet" ? (s.sheet?.tabs.length ? s.sheet.tabs.join(", ") : t("leads.src.noTabs")) : null,
                    s.last_received_at ? t("leads.src.lastLead", { when: fmtDateTime(s.last_received_at) }) : t("leads.src.waiting"),
                    fetchable && s.last_synced_at ? t("leads.src.checked", { when: fmtDateTime(s.last_synced_at) }) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {s.provider === "google_sheet" && (
              <Button size="sm" variant="secondary" onClick={() => onPickTabs(s.id)}>
                {t("leads.src.chooseTabs")}
              </Button>
            )}
            {fetchable && (s.provider !== "google_sheet" || !!s.sheet?.tabs.length) && (
              <IconBtn label={t("leads.src.syncNow")} onClick={() => syncSource(s)} busy={busy === `sync:${s.id}`}>
                <RefreshCw className="h-4 w-4" />
              </IconBtn>
            )}
            {hasSetup && (
              <IconBtn label={t("leads.hub.setup")} onClick={() => setOpen(isOpen ? null : s.id)} active={isOpen}>
                <Settings2 className="h-4 w-4" />
              </IconBtn>
            )}
            {confirmRemove === s.id ? (
              <span className="flex items-center gap-1 pl-1">
                <Button size="sm" variant="danger" loading={busy === `rm:${s.id}`} onClick={() => remove(s)}>
                  {t("leads.hub.removeYes")}
                </Button>
                <IconBtn label={t("common.cancel")} onClick={() => setConfirmRemove(null)}>
                  <X className="h-4 w-4" />
                </IconBtn>
              </span>
            ) : (
              <IconBtn label={t("leads.src.remove")} onClick={() => setConfirmRemove(s.id)} danger>
                <Trash2 className="h-4 w-4" />
              </IconBtn>
            )}
          </div>
        </div>
        {confirmRemove === s.id && <p className="px-3 pb-3 text-caption text-muted">{t("leads.hub.removeHint")}</p>}
        {isOpen && hasSetup && (
          <div className="space-y-3 border-t border-border bg-bg/60 p-4">
            {p.id === "google_ads_form" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <CopyField label={t("leads.src.url")} value={s.hookUrl!} />
                <CopyField label={t("leads.src.key")} value={s.key ?? ""} secret />
              </div>
            ) : (
              <CopyField label={t("leads.hub.urlWithKey")} value={fullUrl(s)} secret />
            )}
            <Steps steps={p.steps} tx={tx} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" loading={busy === `test:${s.id}`} onClick={() => sendTest(s)}>
                <FlaskConical className="h-4 w-4" /> {t("leads.hub.sendTest")}
              </Button>
              <span className="text-caption text-muted">{t("leads.hub.testHint")}</span>
            </div>
          </div>
        )}
      </li>
    );
  };

  /* ─────────────── one integration: how to connect ─────────────── */
  const detail = (p: LeadProvider) => {
    const mine = sources.filter((s) => s.provider === p.id || (p.connect === "automation" && s.label.startsWith(p.name)));
    const gadsOn = p.id === "google_ads" && mine.length > 0;
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => go(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("leads.hub.back")}
        </button>
        <div className="flex items-start gap-4">
          <ProviderLogo provider={p} size={52} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">{p.name}</h3>
            <p className="mt-0.5 text-sm text-muted">{tx(p.blurb)}</p>
          </div>
        </div>
        {banner}
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-3 text-eyebrow font-semibold uppercase tracking-wider text-muted">{t("leads.hub.steps")}</p>
          <Steps steps={p.steps} tx={tx} />
        </div>

        {/* The action for this kind of connection. */}
        {p.connect === "meta" &&
          (metaReady ? (
            <ButtonLink href={`/api/leads/meta/connect${qs}`}>{mine.length ? t("leads.src.reconnect") : t("leads.src.connectMeta")}</ButtonLink>
          ) : (
            <p className="text-sm text-muted">{t("leads.src.metaNotConfigured")}</p>
          ))}
        {p.connect === "meta" && staff && webhook?.verifyToken && (
          <details className="rounded-xl border border-border p-3 text-xs text-muted">
            <summary className="cursor-pointer font-medium">{t("leads.src.metaAppSetup")}</summary>
            <div className="mt-2 space-y-2">
              <p>{t("leads.src.metaAppSteps")}</p>
              <CopyField label="Callback URL" value={webhook.url} />
              <CopyField label="Verify token" value={webhook.verifyToken} secret />
            </div>
          </details>
        )}

        {p.connect === "google_ads" &&
          (gadsOn ? (
            <p className="flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5 text-sm text-success">
              <Check className="h-4 w-4" /> {t("leads.hub.gadsActive")}
            </p>
          ) : (
            <Button loading={busy === "create:google_ads"} onClick={() => create(p)}>
              <Plug className="h-4 w-4" /> {t("leads.hub.turnOn")}
            </Button>
          ))}

        {p.connect === "sheet" && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/docs\.google\.com\/spreadsheets\/d\/[\w-]{20,}/.test(sheetUrl)) return setError({ text: t("leads.hub.sheetBad") });
              setBusy("sheet");
              window.location.href = `/api/leads/sheets/connect?url=${encodeURIComponent(sheetUrl.trim())}${staff ? `&clientId=${clientId}` : ""}`;
            }}
          >
            <input type="url" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder={t("leads.src.sheetUrlPh")} aria-label={t("leads.src.sheetUrlPh")} className="input-base h-10 min-w-0 flex-1 py-0 text-sm" />
            <Button type="submit" loading={busy === "sheet"}>
              {t("leads.src.connectSheet")}
            </Button>
          </form>
        )}

        {p.connect === "token" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (token.trim().length >= 10) void create(p, { token: token.trim() });
            }}
          >
            <label className="block text-caption font-medium text-muted" htmlFor={`tok-${p.id}`}>
              {p.tokenHint ? tx(p.tokenHint) : t("leads.hub.token")}
            </label>
            <div className="flex gap-2">
              <input id={`tok-${p.id}`} type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} className="input-base h-10 min-w-0 flex-1 py-0 font-mono text-sm" />
              <Button type="submit" disabled={token.trim().length < 10} loading={busy === `create:${p.id}`}>
                {t("leads.hub.connect")}
              </Button>
            </div>
            <p className="text-caption text-muted">{t("leads.hub.tokenSafe")}</p>
          </form>
        )}

        {(p.connect === "webhook" || p.connect === "automation") && (
          <div className="flex flex-wrap items-center gap-2">
            {p.connect === "automation" ? (
              (["zapier", "make"] as const).map((via) => (
                <Button key={via} variant="secondary" loading={busy === `create:${via}`} onClick={() => void create(PROVIDER_BY_ID.get(via)!, { label: `${p.name} (${PROVIDER_BY_ID.get(via)!.name})` })}>
                  <ProviderLogo provider={via} size={18} /> {t("leads.hub.via", { name: PROVIDER_BY_ID.get(via)!.name })}
                </Button>
              ))
            ) : (
              <Button loading={busy === `create:${p.id}`} onClick={() => create(p)}>
                <Plug className="h-4 w-4" /> {mine.length ? t("leads.hub.createAnother") : t("leads.hub.createHook")}
              </Button>
            )}
          </div>
        )}

        {mine.length > 0 && (
          <div className="space-y-2">
            <p className="text-eyebrow font-semibold uppercase tracking-wider text-muted">{t("leads.hub.connected")}</p>
            <ul className="space-y-2">
              {mine.map((s) => sourceRow(s))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const current = view ? PROVIDER_BY_ID.get(view) : null;

  return (
    <ModalShell open onClose={onClose} className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{t("leads.sources")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("leads.hub.subtitle", { company: company || "" })}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[calc(100dvh-11rem)] space-y-6 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        {current ? (
          detail(current)
        ) : (
          <>
            {banner}
            {/* Connected */}
            <section className="space-y-2">
              <p className="text-eyebrow font-semibold uppercase tracking-wider text-muted">
                {t("leads.hub.connected")} · {sources.length}
              </p>
              {sources.length ? (
                <ul className="space-y-2">
                  {sources.map((s) => sourceRow(s))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">{t("leads.hub.empty")}</p>
              )}
            </section>

            {/* Catalogue */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-eyebrow font-semibold uppercase tracking-wider text-muted">{t("leads.hub.add")}</p>
                <label className="relative w-full sm:w-auto">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("leads.hub.search")} aria-label={t("leads.hub.search")} className="input-base h-9 w-full py-0 pl-8 text-sm sm:w-56" />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5" role="tablist">
                {GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={group === g}
                    onClick={() => setGroup(g)}
                    className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", group === g ? "bg-foreground text-bg" : "bg-surface-2 text-muted hover:text-foreground")}
                  >
                    {t(`leads.hub.group.${g}`)}
                  </button>
                ))}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {catalogue.map((p) => {
                  const n = sources.filter((s) => s.provider === p.id).length;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => go(p.id)}
                      className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-all hover:-translate-y-px hover:border-brand/40 hover:shadow-card"
                    >
                      <ProviderLogo provider={p} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                          {n > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                              <Check className="h-2.5 w-2.5" /> {n}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-caption leading-snug text-muted">{tx(p.blurb)}</span>
                      </span>
                    </button>
                  );
                })}
                {!catalogue.length && <p className="col-span-full py-6 text-center text-sm text-muted">{t("leads.hub.noMatch")}</p>}
              </div>
            </section>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function Steps({ steps, tx }: { steps?: { de: string; en: string }[]; tx: (x: { de: string; en: string }) => string }) {
  if (!steps?.length) return null;
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-foreground">
          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand-ink">{i + 1}</span>
          <span className="leading-relaxed">{tx(s)}</span>
        </li>
      ))}
    </ol>
  );
}

function IconBtn({ label, onClick, busy, active, danger, children }: { label: string; onClick: () => void; busy?: boolean; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn("rounded-lg p-2 text-muted transition-colors hover:bg-surface-2", danger ? "hover:text-danger" : "hover:text-foreground", active && "bg-surface-2 text-foreground")}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}
