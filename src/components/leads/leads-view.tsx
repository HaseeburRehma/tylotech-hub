"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Download, Inbox, Plug, Plus, Search, Sparkles, Trophy, UserPlus, Users, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterMenu } from "@/components/ui/filter-menu";
import { classColors, classifyLeads, type CampaignStat } from "@/lib/campaign-classify";
import { berlinToday, inRange, presetRange, type DateRange } from "@/lib/date-range";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { useUser } from "@/components/providers/user-provider";
import { useT, useIntlLocale } from "@/lib/i18n/provider";
import { OPEN_STATUSES, LEAD_STATUSES, findDuplicates, type Lead, type LeadPerson, type LeadSourceView, type LeadStatus } from "@/lib/leads-shared";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LeadTags, STATUS_VARIANT, SourceBadge, fmtDateTime, since } from "./lead-bits";
import { AdThumb, CampaignPanel, type CampaignSelection } from "./campaign-panel";
import { ContactButtons, OwnerMenu, StatusMenu } from "./lead-row-controls";
import { LeadDrawer } from "./lead-drawer";
import { AddLeadModal, InviteSalesModal, MetaPagesModal, SheetTabsModal, SourcesModal } from "./lead-modals";

type OwnerFilter = "all" | "me" | "none" | string;
type SortKey = "no" | "name" | "source" | "status" | "owner" | "received";

// One grid for the header and every row, so the columns always line up.
const GRID =
  "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 md:grid-cols-[3rem_minmax(0,1.5fr)_minmax(0,1.2fr)_auto] xl:grid-cols-[3.5rem_minmax(0,1.5fr)_minmax(0,1.4fr)_10rem_9rem_7rem]";
const PAGE_SIZES = [25, 50, 100] as const;
const PAGE_SIZE_KEY = "leads.pageSize";

const RANGE_KEY = "leads.range";
const DOT: Record<string, string> = { info: "bg-info", neutral: "bg-muted", warning: "bg-warning", brand: "bg-brand", success: "bg-success", danger: "bg-danger", outline: "bg-border" };

interface CampaignData {
  /** Which partner + period these numbers are for. */
  key?: string;
  campaigns: CampaignStat[];
  currency: string;
  errors: { provider: string; error: string }[];
  connected: string[];
}

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
  const [tag, setTag] = useState<string>("all");
  // "N new today" jumps to the Today range and back to the range before.
  const [beforeToday, setBeforeToday] = useState<DateRange | null>(null);
  const [range, setRange] = useState<DateRange>(() => presetRange("maximum"));
  const [selection, setSelection] = useState<CampaignSelection | null>(null);
  const [campLoaded, setCampData] = useState<CampaignData | null>(null);
  const [campLoading, setCampLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "received", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [sheetSource, setSheetSource] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "add" | "sources" | "invite" | "metaPages" | "sheetTabs">(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setLeads(initial), [initial]);

  useEffect(() => {
    try {
      const n = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
      if ((PAGE_SIZES as readonly number[]).includes(n)) setPageSize(n);
      // The chosen preset (not its days: "Last 7 days" moves with the calendar).
      const p = window.localStorage.getItem(RANGE_KEY);
      if (p && p !== "custom" && p !== "maximum") setRange(presetRange(p as Exclude<DateRange["preset"], "custom">));
    } catch {
      /* storage blocked: keep the defaults */
    }
  }, []);

  const changeRange = (r: DateRange) => {
    setRange(r);
    setSelection(null);
    try {
      window.localStorage.setItem(RANGE_KEY, r.preset);
    } catch {
      /* storage blocked: only this visit */
    }
  };

  // Spend per campaign / ad for the period (Meta + Google Ads), from the server.
  useEffect(() => {
    if (!clientId || unavailable) return;
    const ctrl = new AbortController();
    setCampLoading(true);
    const qs = new URLSearchParams();
    if (staff) qs.set("clientId", clientId);
    if (range.since && range.until) {
      qs.set("from", range.since);
      qs.set("to", range.until);
    }
    const key = `${clientId}|${range.since}|${range.until}`;
    fetch(`/api/leads/campaigns?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok) setCampData({ ...(j as CampaignData), key });
        else setCampData({ key, campaigns: [], currency: "EUR", errors: [{ provider: "meta_ads", error: String(j?.error ?? "Error") }], connected: [] });
      })
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setCampLoading(false));
    return () => ctrl.abort();
  }, [clientId, staff, unavailable, range.since, range.until]);
  // Spend of the previous period must never meet the leads of the new one.
  const campData = campLoaded?.key === `${clientId}|${range.since}|${range.until}` ? campLoaded : null;

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
    // Read once — drop them (and Facebook's "#_=_") so a reload or a client
    // switch doesn't replay the connect result. ?client= stays as the page's scope.
    // Through the router (not history.replaceState): a later router.refresh()
    // would otherwise restore the old URL from Next's own state.
    // ?sheet=pick&source=… after connecting a Google Sheet; ?sheet=<reason> when it failed.
    const sheet = sp.get("sheet");
    const src = sp.get("source");
    if (sheet === "pick" && src) {
      setSheetSource(src);
      setModal("sheetTabs");
    } else if (sheet) {
      setNotice(t(`leads.sheet.err.${sheet}`));
      setModal("sources");
    }
    if (id || meta || sheet || window.location.hash) {
      for (const k of ["lead", "meta", "pages", "sheet", "source"]) sp.delete(k);
      const qs = sp.toString();
      router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
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

  // Leads of the period: the base for the campaign breakdown and the table.
  const inPeriod = useMemo(() => leads.filter((l) => inRange(l.created_at, range)), [leads, range]);
  const classified = useMemo(() => classifyLeads(inPeriod, campData?.campaigns ?? [], dl.startsWith("de") ? "de" : "en"), [inPeriod, campData, dl]);
  const selectedIds = useMemo(() => (selection ? new Set(selection.leadIds) : null), [selection]);
  // One color per campaign: the stripe on each lead and the dot in the campaign list.
  const colors = useMemo(() => classColors(classified.rows.map((r) => r.key)), [classified]);
  const today = berlinToday();
  const isToday = (iso: string) => berlinToday(new Date(iso)) === today;
  // Same person again (phone or email of an earlier lead): sales sees "duplicate of #n".
  const duplicateOf = useMemo(() => findDuplicates(leads), [leads]);
  // From all leads: ranges like "last 30 days" end yesterday, like Ads Manager.
  const todayCount = useMemo(() => leads.filter((l) => !l.is_test && berlinToday(new Date(l.created_at)) === today).length, [leads, today]);
  const todayOnly = range.preset === "today";
  const toggleToday = () => {
    if (todayOnly) {
      changeRange(beforeToday ?? presetRange("maximum"));
      setBeforeToday(null);
    } else {
      setBeforeToday(range);
      changeRange(presetRange("today"));
    }
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return inPeriod.filter((l) => {
      if (selectedIds && !selectedIds.has(l.id)) return false;
      if (status === "open" ? !OPEN_STATUSES.includes(l.status) : status !== "all" && l.status !== status) return false;
      if (source !== "all" && l.source !== source) return false;
      if (owner === "me" && l.assigned_to !== user.id) return false;
      if (owner === "none" && l.assigned_to) return false;
      if (owner !== "all" && owner !== "me" && owner !== "none" && l.assigned_to !== owner) return false;
      if (tag !== "all" && !(l.tags ?? []).includes(tag)) return false;
      if (!term) return true;
      return (
        String(l.lead_no) === term.replace(/^#/, "") ||
        [l.name, l.email, l.phone, l.campaign, l.ad_group, l.ad, l.form, ...(l.tags ?? []), ...l.fields.map((f) => f.value)].some((v) => v?.toLowerCase().includes(term))
      );
    });
  }, [inPeriod, selectedIds, q, status, source, owner, tag, user.id]);

  // Sorted, then cut into pages.
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const rank = (s: LeadStatus) => LEAD_STATUSES.indexOf(s);
    const key = (l: Lead): string | number => {
      switch (sort.key) {
        case "no":
          return l.lead_no;
        case "name":
          return (l.name ?? l.email ?? l.phone ?? "").toLocaleLowerCase("de");
        case "source":
          return `${l.source} ${l.campaign ?? l.form ?? ""}`.toLocaleLowerCase("de");
        case "status":
          return rank(l.status);
        case "owner":
          return (nameOf.get(l.assigned_to ?? "") ?? "").toLocaleLowerCase("de");
        default:
          return new Date(l.created_at).getTime();
      }
    };
    // Leads without a name / owner go last in either direction.
    const blank = (l: Lead) => (sort.key === "name" ? !(l.name ?? l.email ?? l.phone) : sort.key === "owner" ? !l.assigned_to : false);
    return [...shown].sort((a, b) => {
      const ba = blank(a);
      const bb = blank(b);
      if (ba !== bb) return ba ? 1 : -1;
      const x = key(a);
      const y = key(b);
      if (x < y) return -dir;
      if (x > y) return dir;
      return b.lead_no - a.lead_no;
    });
  }, [shown, sort, nameOf]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = sorted.slice((current - 1) * pageSize, current * pageSize);
  const first = sorted.length ? (current - 1) * pageSize + 1 : 0;
  const last = Math.min(current * pageSize, sorted.length);

  // New filters or order: back to the first page.
  useEffect(() => setPage(1), [q, status, source, owner, tag, range, selection, sort, pageSize]);

  const filtersActive = q.trim() !== "" || status !== "open" || source !== "all" || owner !== "all" || tag !== "all" || range.preset !== "maximum" || !!selection;
  const clearFilters = () => {
    setQ("");
    setStatus("open");
    setSource("all");
    setOwner("all");
    setTag("all");
    setBeforeToday(null);
    changeRange(presetRange("maximum"));
  };
  const updateLead = (l: Lead) => setLeads((all) => all.map((x) => (x.id === l.id ? l : x)));
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of inPeriod) {
      c[`s:${l.status}`] = (c[`s:${l.status}`] ?? 0) + 1;
      c[`src:${l.source}`] = (c[`src:${l.source}`] ?? 0) + 1;
      for (const tg of l.tags ?? []) c[`t:${tg}`] = (c[`t:${tg}`] ?? 0) + 1;
    }
    return c;
  }, [inPeriod]);
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "received" || key === "no" ? "desc" : "asc" }));
  const changePageSize = (n: number) => {
    setPageSize(n);
    try {
      window.localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      /* storage blocked: only this visit */
    }
  };
  const goPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), pageCount));
    document.getElementById("leads-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Tags that occur in this partner's leads (filter only shows when there are any).
  const allTags = useMemo(() => Array.from(new Set(leads.flatMap((l) => l.tags ?? []))).sort((a, b) => a.localeCompare(b, "de")), [leads]);

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t("leads.range.hint")}</p>
        <DateRangePicker value={range} onChange={changeRange} />
      </div>

      <CampaignPanel
        rows={classified.rows}
        totals={classified.totals}
        currency={campData?.currency ?? "EUR"}
        loading={campLoading}
        errors={campData?.errors ?? []}
        hasAds={!!campData?.connected.length}
        selected={selection}
        onSelect={setSelection}
        colors={colors}
        integrationsHref={`/integrations${staff && clientId ? `?client=${clientId}` : ""}`}
      />

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("leads.searchPh")} className="input-base h-10 py-0 pl-9 text-sm" aria-label={t("leads.searchPh")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterMenu
              label={t("leads.filter.status")}
              value={status}
              defaultValue="open"
              onChange={(v) => setStatus(v as typeof status)}
              options={[
                { value: "open", label: t("leads.filter.open") },
                { value: "all", label: t("leads.filter.all"), count: inPeriod.length },
                ...LEAD_STATUSES.map((s) => ({ value: s, label: t(`leads.status.${s}`), icon: <span className={cn("h-2 w-2 rounded-full", DOT[STATUS_VARIANT[s]])} />, count: counts[`s:${s}`] ?? 0 })),
              ]}
            />
            <FilterMenu
              label={t("leads.filter.source")}
              value={source}
              defaultValue="all"
              onChange={(v) => setSource(v as typeof source)}
              options={[
                { value: "all", label: t("leads.filter.allSources") },
                { value: "meta", label: "Meta", count: counts["src:meta"] ?? 0 },
                { value: "google_ads", label: "Google Ads", count: counts["src:google_ads"] ?? 0 },
                { value: "webhook", label: t("leads.src.website"), count: counts["src:webhook"] ?? 0 },
                { value: "manual", label: t("leads.source.manual"), count: counts["src:manual"] ?? 0 },
              ]}
            />
            <FilterMenu
              label={t("leads.filter.owner")}
              value={owner}
              defaultValue="all"
              onChange={setOwner}
              width={260}
              options={[
                { value: "all", label: t("leads.filter.everyone") },
                { value: "me", label: t("leads.filter.mine") },
                { value: "none", label: t("leads.filter.unassigned") },
                ...people.map((p) => ({ value: p.id, label: p.name, icon: <Avatar name={p.name} size={18} /> })),
              ]}
            />
            {allTags.length > 0 && (
              <FilterMenu
                label={t("leads.filter.tag")}
                value={tag}
                defaultValue="all"
                onChange={setTag}
                options={[{ value: "all", label: t("leads.filter.allTags") }, ...allTags.map((x) => ({ value: x, label: x, count: counts[`t:${x}`] ?? 0 }))]}
              />
            )}
            <button
              type="button"
              onClick={toggleToday}
              aria-pressed={todayOnly}
              disabled={!todayCount && !todayOnly}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium outline-none transition-colors field-focus disabled:opacity-50",
                todayOnly ? "border-success/50 bg-success/15 text-success" : "border-border bg-bg text-foreground hover:bg-surface-2/60",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full bg-success", todayCount > 0 && "animate-pulse")} />
              {t("leads.today.count", { n: todayCount })}
            </button>
            {filtersActive && (
              <Button size="sm" variant="ghost" className="h-10" onClick={clearFilters}>
                <X className="h-4 w-4" /> {t("leads.filter.clear")}
              </Button>
            )}
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
          <div id="leads-table" className="scroll-mt-4">
          <div role="row" className={cn(GRID, "sticky top-0 z-10 border-b border-border bg-surface-2/80 py-2 backdrop-blur")}>
            {(
              [
                ["no", t("leads.col.no"), ""],
                ["name", t("leads.col.lead"), ""],
                ["source", t("leads.col.campaign"), "hidden md:flex"],
                ["status", t("leads.col.status"), "justify-self-end md:justify-self-start"],
                ["owner", t("leads.col.owner"), "hidden xl:flex"],
                ["received", t("leads.col.received"), "hidden xl:flex xl:justify-self-end"],
              ] as [SortKey, string, string][]
            ).map(([key, label, cls]) => {
              const on = sort.key === key;
              const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <span key={key} role="columnheader" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("flex min-w-0", cls)}>
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={cn("inline-flex items-center gap-1 rounded text-eyebrow font-semibold uppercase tracking-wide transition-colors hover:text-foreground", on ? "text-foreground" : "text-muted")}
                    title={t("leads.sortBy", { col: label })}
                  >
                    {label}
                    <Icon className={cn("h-3 w-3 shrink-0", !on && "opacity-50")} />
                  </button>
                </span>
              );
            })}
          </div>
          <ul className="divide-y divide-border">
            {pageRows.map((l) => {
              const lab = classified.labels.get(l.id);
              const color = colors.get(classified.groupOf.get(l.id) ?? "");
              const fresh = isToday(l.created_at);
              return (
              <li key={l.id}>
                {/* A row, not a button: it holds its own buttons (status, owner, WhatsApp). */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(l.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setOpenId(l.id);
                    }
                  }}
                  aria-label={`Lead #${l.lead_no}`}
                  // Campaign color as a stripe on the left edge (test / invalid leads have none).
                  style={color ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                  className={cn(GRID, "cursor-pointer py-3 text-left outline-none transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60", fresh && "bg-success/[0.04]")}
                >
                  <span className="font-mono text-xs text-muted">#{l.lead_no}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm text-foreground", l.status === "new" && "font-semibold")}>
                        {l.name ?? l.email ?? l.phone ?? t("leads.noName")}
                        {fresh && !l.is_test && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 align-middle text-eyebrow font-semibold text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            {t("leads.today.badge")}
                          </span>
                        )}
                        {duplicateOf.has(l.id) && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-warning/15 px-1.5 py-0.5 align-middle text-eyebrow font-semibold text-warning">
                            {t("leads.duplicateOf", { n: duplicateOf.get(l.id)! })}
                          </span>
                        )}
                        {l.is_test && <span className="ml-2 rounded bg-warning/15 px-1 text-eyebrow font-semibold text-warning">TEST</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">{[l.phone, l.email].filter(Boolean).join(" · ") || "-"}</span>
                    </span>
                    <ContactButtons lead={l} onChange={updateLead} />
                  </span>
                  <span className="hidden min-w-0 md:block">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SourceBadge lead={l} />
                      <LeadTags tags={l.tags} max={2} />
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground" title={lab?.campaign ?? l.campaign ?? l.form ?? ""}>
                        {color && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
                        <span className="truncate">{lab?.campaign ?? l.campaign ?? l.form ?? ""}</span>
                      </span>
                    </span>
                    {(lab ? lab.ad : l.ad) && (
                      <span className="mt-1 flex min-w-0 items-center gap-1.5" title={[lab ? lab.adset : l.ad_group, lab ? lab.ad : l.ad].filter(Boolean).join(" › ")}>
                        <AdThumb src={lab?.thumbnail ?? null} size={18} />
                        <span className="truncate text-xs text-muted">{lab ? lab.ad : l.ad}</span>
                      </span>
                    )}
                  </span>
                  <span className="justify-self-end md:justify-self-start">
                    <StatusMenu lead={l} onChange={updateLead} onError={setNotice} />
                  </span>
                  <span className="hidden min-w-0 xl:flex">
                    <OwnerMenu lead={l} people={people} onChange={updateLead} onError={setNotice} />
                  </span>
                  <span className="hidden text-right text-xs text-muted xl:block" title={fmtDateTime(l.created_at)}>
                    {l.appointment_at && l.status === "appointment_set" ? (
                      <span className="text-brand-ink">📅 {fmtDateTime(l.appointment_at)}</span>
                    ) : (
                      since(l.created_at, t)
                    )}
                  </span>
                </div>
              </li>
            );
            })}
          </ul>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="tabular-nums">{t("leads.page.range", { from: first, to: last, total: sorted.length })}</span>
              <label className="flex items-center gap-1.5">
                <span>{t("leads.page.size")}</span>
                <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))} className="input-base h-8 w-auto appearance-none py-0 pl-2 pr-7 text-xs">
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Pagination
              page={current}
              pageCount={pageCount}
              onPage={goPage}
              labels={{ prev: t("leads.page.prev"), next: t("leads.page.next"), page: (n) => t("leads.page.n", { n }) }}
            />
          </div>
          </div>
        )}
      </Card>

      {open && (
        <LeadDrawer
          lead={open}
          label={classified.labels.get(open.id)}
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
        <SourcesModal
          clientId={clientId}
          staff={staff}
          sources={sources}
          metaReady={metaReady}
          webhook={webhook}
          onClose={() => setModal(null)}
          onChanged={() => router.refresh()}
          onPickTabs={(id) => {
            setSheetSource(id);
            setModal("sheetTabs");
          }}
        />
      )}
      {modal === "sheetTabs" && sheetSource && (
        <SheetTabsModal
          sourceId={sheetSource}
          onClose={() => setModal("sources")}
          onDone={(r) => {
            setModal(null);
            setNotice(`${t("leads.sheet.imported", { added: r.added, updated: r.updated })}${r.pending ? ` ${t("leads.sheet.more")}` : ""}`);
            router.refresh();
          }}
        />
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
