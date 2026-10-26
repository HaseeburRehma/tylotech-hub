"use client";

import { CalendarClock, Download, Inbox, Plug, Plus, Search, Sparkles, Trophy, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useUser } from "@/components/providers/user-provider";
import { useT, useIntlLocale } from "@/lib/i18n/provider";
import { OPEN_STATUSES, LEAD_STATUSES, type Lead, type LeadPerson, type LeadSourceView, type LeadStatus } from "@/lib/leads-shared";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SourceBadge, StatusBadge, fmtDateTime, since } from "./lead-bits";
import { LeadDrawer } from "./lead-drawer";
import { AddLeadModal, InviteSalesModal, MetaPagesModal, SourcesModal } from "./lead-modals";

type OwnerFilter = "all" | "me" | "none" | string;

/**
 * Leads of one partner: every enquiry from Meta / Google Ads / website forms
 * with all answers, worked by the partner's sales people — status pipeline,
 * owner, appointment, value and a timeline. Live: new leads appear instantly.
 */
export function LeadsView({
  unavailable,
  leads: initial,
  people,
  sources,
  clientId,
  company,
  staff,
  metaReady,
  webhook,
}: {
  unavailable: boolean;
  leads: Lead[];
  people: LeadPerson[];
  sources: LeadSourceView[];
  clientId: string | null;
  company: string;
  staff: boolean;
  metaReady: boolean;
  webhook: { url: string; verifyToken: string | null } | null;
}) {
  const t = useT();
  const dl = useIntlLocale();
  const user = useUser();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"open" | "all" | LeadStatus>("open");
  const [source, setSource] = useState<"all" | Lead["source"]>("all");
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "add" | "sources" | "invite" | "metaPages">(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setLeads(initial), [initial]);

  // ?lead=<id> (from a notification) opens it; ?meta=… reports the Meta connect result.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("lead");
    if (id) setOpenId(id);
    const meta = sp.get("meta");
    if (meta === "pick") setModal("metaPages");
    else if (meta) {
      setNotice(meta === "connected" ? t("leads.meta.connected", { n: sp.get("pages") ?? "1" }) : t(`leads.meta.err.${meta}`));
      if (meta !== "connected") setModal("sources");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: new and changed leads of this partner.
  useEffect(() => {
    if (!clientId || unavailable) return;
    const sb = createClient();
    if (!sb) return;
    const ch = sb
      .channel(`leads:${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `client_id=eq.${clientId}` }, (p) => {
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string }).id;
          setLeads((l) => l.filter((x) => x.id !== id));
          return;
        }
        const row = p.new as Lead;
        setLeads((l) => (l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [row, ...l]));
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [clientId, unavailable]);

  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (status === "open" ? !OPEN_STATUSES.includes(l.status) : status !== "all" && l.status !== status) return false;
      if (source !== "all" && l.source !== source) return false;
      if (owner === "me" && l.assigned_to !== user.id) return false;
      if (owner === "none" && l.assigned_to) return false;
      if (owner !== "all" && owner !== "me" && owner !== "none" && l.assigned_to !== owner) return false;
      if (!term) return true;
      return (
        String(l.lead_no) === term.replace(/^#/, "") ||
        [l.name, l.email, l.phone, l.campaign, l.form, ...l.fields.map((f) => f.value)].some((v) => v?.toLowerCase().includes(term))
      );
    });
  }, [leads, q, status, source, owner, user.id]);

  const stats = useMemo(() => {
    const now = Date.now();
    const monthStart = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const real = leads.filter((l) => !l.is_test);
    const won = real.filter((l) => l.status === "won" && new Date(l.updated_at) >= monthStart);
    return {
      fresh: real.filter((l) => l.status === "new").length,
      month: real.filter((l) => new Date(l.created_at) >= monthStart).length,
      appointments: real.filter((l) => l.appointment_at && new Date(l.appointment_at).getTime() > now && ["appointment_set"].includes(l.status)).length,
      won: won.length,
      wonValue: won.reduce((n, l) => n + Number(l.value ?? 0), 0),
    };
  }, [leads]);

  const open = leads.find((l) => l.id === openId) ?? null;

  if (unavailable) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("leads.title")} subtitle={t("leads.subtitle")} />
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{t("leads.needsMigration")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("leads.title")} subtitle={company ? t("leads.subtitleFor", { company }) : t("leads.subtitle")}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setModal("sources")}>
            <Plug className="h-4 w-4" /> {t("leads.sources")}
            {sources.some((s) => s.status === "error") && <span className="h-2 w-2 rounded-full bg-danger" />}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setModal("invite")}>
            <UserPlus className="h-4 w-4" /> {t("leads.inviteSales")}
          </Button>
          <ButtonLink href={`/api/leads/export${staff && clientId ? `?clientId=${clientId}` : ""}`} size="sm" variant="ghost">
              <Download className="h-4 w-4" /> CSV
            </ButtonLink>
          <Button size="sm" onClick={() => setModal("add")}>
            <Plus className="h-4 w-4" /> {t("leads.add")}
          </Button>
        </div>
      </PageHeader>

      {notice && (
        <button type="button" onClick={() => setNotice(null)} className="w-full rounded-lg bg-brand/10 px-3 py-2 text-left text-sm text-foreground">
          {notice}
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: Sparkles, label: t("leads.stat.new"), value: stats.fresh, onClick: () => setStatus("new") },
          { icon: Inbox, label: t("leads.stat.month"), value: stats.month, onClick: () => setStatus("all") },
          { icon: CalendarClock, label: t("leads.stat.appointments"), value: stats.appointments, onClick: () => setStatus("appointment_set") },
          {
            icon: Trophy,
            label: t("leads.stat.won"),
            value: stats.won,
            sub: stats.wonValue ? stats.wonValue.toLocaleString(dl, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : null,
            onClick: () => setStatus("won"),
          },
        ].map((s) => (
          <button key={s.label} type="button" onClick={s.onClick} className="text-left">
            <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand-icon">
                <s.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-semibold tabular-nums text-foreground">{s.value}</span>
                <span className="line-clamp-2 block text-xs leading-tight text-muted">
                  {s.label}
                  {"sub" in s && s.sub ? ` · ${s.sub}` : ""}
                </span>
              </span>
            </Card>
          </button>
        ))}
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("leads.searchPh")} className="input-base h-10 py-0 pl-9 text-sm" aria-label={t("leads.searchPh")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="input-base h-10 w-auto appearance-none py-0 pr-8 text-sm" aria-label={t("leads.filter.status")}>
              <option value="open">{t("leads.filter.open")}</option>
              <option value="all">{t("leads.filter.all")}</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`leads.status.${s}`)}
                </option>
              ))}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="input-base h-10 w-auto appearance-none py-0 pr-8 text-sm" aria-label={t("leads.filter.source")}>
              <option value="all">{t("leads.filter.allSources")}</option>
              <option value="meta">Meta</option>
              <option value="google_ads">Google Ads</option>
              <option value="webhook">{t("leads.src.website")}</option>
              <option value="manual">{t("leads.source.manual")}</option>
            </select>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input-base h-10 w-auto appearance-none py-0 pr-8 text-sm" aria-label={t("leads.filter.owner")}>
              <option value="all">{t("leads.filter.everyone")}</option>
              <option value="me">{t("leads.filter.mine")}</option>
              <option value="none">{t("leads.filter.unassigned")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Users className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-foreground">{leads.length ? t("leads.emptyFiltered") : t("leads.emptyTitle")}</p>
            {!leads.length && (
              <>
                <p className="max-w-md text-sm text-muted">{t("leads.emptyText")}</p>
                <Button size="sm" className="mt-2" onClick={() => setModal("sources")}>
                  <Plug className="h-4 w-4" /> {t("leads.connectSources")}
                </Button>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setOpenId(l.id)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 md:grid-cols-[3rem_minmax(0,1.5fr)_minmax(0,1.2fr)_auto] xl:grid-cols-[3.5rem_minmax(0,1.6fr)_minmax(0,1.2fr)_9rem_8rem_8rem]">
                  <span className="font-mono text-xs text-muted">#{l.lead_no}</span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm text-foreground", l.status === "new" && "font-semibold")}>
                      {l.name ?? l.email ?? l.phone ?? t("leads.noName")}
                      {l.is_test && <span className="ml-2 rounded bg-warning/15 px-1 text-eyebrow font-semibold text-warning">TEST</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{[l.phone, l.email].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className="flex items-center gap-1.5">
                      <SourceBadge lead={l} />
                      <span className="truncate text-xs text-muted">{l.campaign ?? l.form ?? ""}</span>
                    </span>
                  </span>
                  <span className="justify-self-end md:justify-self-start">
                    <StatusBadge status={l.status} />
                  </span>
                  <span className="hidden items-center gap-1.5 xl:flex">
                    {l.assigned_to ? (
                      <>
                        <Avatar name={nameOf.get(l.assigned_to) ?? "?"} size={22} />
                        <span className="truncate text-xs text-muted">{(nameOf.get(l.assigned_to) ?? "—").split(" ")[0]}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted/60">{t("leads.unassigned")}</span>
                    )}
                  </span>
                  <span className="hidden text-right text-xs text-muted xl:block">
                    {l.appointment_at && l.status === "appointment_set" ? (
                      <span className="text-brand-ink">📅 {fmtDateTime(l.appointment_at)}</span>
                    ) : (
                      since(l.created_at, t)
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <LeadDrawer
          lead={open}
          people={people}
          staff={staff}
          onClose={() => {
            setOpenId(null);
            const url = new URL(window.location.href);
            if (url.searchParams.has("lead")) {
              url.searchParams.delete("lead");
              window.history.replaceState(null, "", url.toString());
            }
          }}
          onChange={(l) => setLeads((all) => all.map((x) => (x.id === l.id ? l : x)))}
          onDeleted={(id) => {
            setLeads((all) => all.filter((x) => x.id !== id));
            setOpenId(null);
          }}
        />
      )}
      {modal === "add" && clientId && (
        <AddLeadModal
          clientId={staff ? clientId : null}
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            router.refresh();
            setOpenId(id);
          }}
        />
      )}
      {modal === "sources" && clientId && (
        <SourcesModal clientId={clientId} staff={staff} sources={sources} metaReady={metaReady} webhook={webhook} onClose={() => setModal(null)} onChanged={() => router.refresh()} />
      )}
      {modal === "invite" && clientId && <InviteSalesModal clientId={staff ? clientId : null} company={company} onClose={() => setModal(null)} />}
      {modal === "metaPages" && clientId && (
        <MetaPagesModal
          clientId={clientId}
          staff={staff}
          company={company}
          onClose={() => setModal("sources")}
          onDone={(n) => {
            setModal(null);
            setNotice(t("leads.meta.connected", { n: String(n) }));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
