"use client";

import { motion } from "framer-motion";
import {
  ArrowDownUp,
  ArrowRight,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useUser } from "@/components/providers/user-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { NewClientModal } from "@/components/modals/new-client-modal";
import { HealthBadge } from "@/components/health/health";
import type { ClientHealth } from "@/lib/health";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { useT } from "@/lib/i18n/provider";
import { cn, formatCurrency } from "@/lib/utils";
import type { ClientListRow, TeamMember } from "@/lib/data";

type PlanFilter = "all" | "Growth" | "Scale" | "new" | "archived" | "risk";
type SortKey = "budget" | "mrr" | "leads" | "name" | "newest" | "health";
const SORTS: Record<SortKey, { label: string; cmp: (a: ClientListRow, b: ClientListRow) => number }> = {
  budget: { label: "clients.sortBudget", cmp: (a, b) => b.spend30d - a.spend30d },
  mrr: { label: "clients.sortMrr", cmp: (a, b) => b.mrr - a.mrr },
  leads: { label: "clients.sortLeads", cmp: (a, b) => b.leads30d - a.leads30d },
  name: { label: "clients.sortName", cmp: (a, b) => a.company.localeCompare(b.company) },
  newest: { label: "clients.sortNewest", cmp: (a, b) => b.created_at.localeCompare(a.created_at) },
  health: { label: "health.sort", cmp: () => 0 },
};

const PLAN_VARIANT: Record<string, "success" | "brand" | "neutral"> = {
  Growth: "success",
  Scale: "brand",
};

function Sparkline({ data }: { data: { date: string; spend: number }[] }) {
  if (data.length < 2) return <div className="h-8 w-24" />;
  const values = data.map((d) => d.spend);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 96;
  const h = 32;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const trend = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={trend ? "rgb(var(--brand))" : "rgb(180,80,60)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClientsView({
  clients,
  team,
  health = {},
}: {
  clients: ClientListRow[];
  team: TeamMember[];
  health?: Record<string, ClientHealth>;
}) {
  const t = useT();
  const [filter, setFilter] = useState<PlanFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("budget");
  const [member, setMember] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [showNewClient, setShowNewClient] = useState(false);
  const router = useRouter();
  const user = useUser();
  const canArchive = user.role === "admin";

  async function restore(id: string) {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    }).catch(() => null);
    if (res?.ok) router.refresh();
  }
  const extraFilters = (member !== "all" ? 1 : 0) + (activeOnly ? 1 : 0);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const archivedCount = clients.filter((c) => c.archived_at).length;
  const riskCount = clients.filter((c) => !c.archived_at && health[c.id]?.level === "risk").length;
  const active = clients.filter((c) => !c.archived_at);
  const newCount = active.filter((c) => c.created_at.slice(0, 7) === thisMonth).length;

  // Unknown scores sort last; otherwise lowest (most critical) first.
  const healthOf = (id: string) => health[id]?.score ?? Number.POSITIVE_INFINITY;
  const sorted = useMemo(
    () =>
      [...clients]
        .filter((c) => (filter === "archived" ? !!c.archived_at : !c.archived_at))
        .sort(sort === "health" ? (a, b) => healthOf(a.id) - healthOf(b.id) : SORTS[sort].cmp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients, sort, filter, health],
  );

  const filtered = sorted
    .filter((c) => {
      if (filter === "all" || filter === "archived") return true;
      if (filter === "risk") return health[c.id]?.level === "risk";
      if (filter === "new") return c.created_at.slice(0, 7) === thisMonth;
      return c.plan === filter;
    })
    .filter((c) => member === "all" || c.assignedTeam.some((m) => m.id === member))
    .filter((c) => !activeOnly || c.spend30d > 0 || c.leads30d > 0)
    .filter(
      (c) =>
        !search ||
        c.company.toLowerCase().includes(search.toLowerCase()) ||
        (c.name ?? "").toLowerCase().includes(search.toLowerCase()),
    );

  const planCounts = {
    Growth: active.filter((c) => c.plan === "Growth").length,
    Scale: active.filter((c) => c.plan === "Scale").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("clients.title")}
        subtitle={`${active.length} ${t("clients.accounts")} · ${planCounts.Growth} ${t("clients.onGrowth")} · ${planCounts.Scale} ${t("clients.onScale")}`}
      >
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("clients.search")}
              className="input-base h-10 w-full pl-9 pr-3 text-sm sm:w-[200px] sm:pr-10"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted sm:block">
              ⌘K
            </kbd>
          </div>
          <Button size="sm" onClick={() => setShowNewClient(true)}>
            <Plus className="h-4 w-4" />
            {t("clients.addClient")}
          </Button>
        </div>
      </PageHeader>

      <NewClientModal open={showNewClient} onClose={() => setShowNewClient(false)} />

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
          {(
            [
              { key: "all" as const, label: t("clients.all"), count: active.length },
              { key: "Growth" as const, label: "Growth", count: planCounts.Growth },
              { key: "Scale" as const, label: "Scale", count: planCounts.Scale },
              { key: "new" as const, label: t("clients.newMonth"), count: newCount },
              ...(riskCount ? [{ key: "risk" as const, label: t("health.filterRisk"), count: riskCount }] : []),
              ...(archivedCount ? [{ key: "archived" as const, label: t("clients.archived"), count: archivedCount }] : []),
            ]
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
                filter === p.key
                  ? "bg-brand/10 font-medium text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {p.label}
              <span className="ml-1.5 text-xs text-muted">{p.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Menu
            width={230}
            align="end"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3 py-1.5 text-sm transition-colors hover:text-foreground",
                  extraFilters ? "border-brand/40 text-foreground" : "border-border text-muted",
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t("clients.filter")}
                {extraFilters > 0 && (
                  <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-foreground">
                    {extraFilters}
                  </span>
                )}
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem selected={activeOnly} onSelect={() => setActiveOnly((v) => !v)}>
                  {t("clients.withActivity")}
                </MenuItem>
                <MenuSeparator />
                <MenuLabel>{t("clients.col.team")}</MenuLabel>
                <MenuItem selected={member === "all"} onSelect={() => { setMember("all"); close(); }}>
                  {t("clients.all")}
                </MenuItem>
                {team.map((m) => (
                  <MenuItem
                    key={m.id}
                    icon={<Avatar name={m.name} size={18} />}
                    selected={member === m.id}
                    onSelect={() => { setMember(m.id); close(); }}
                  >
                    {m.name}
                  </MenuItem>
                ))}
                {extraFilters > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuItem onSelect={() => { setMember("all"); setActiveOnly(false); close(); }}>
                      {t("clients.resetFilters")}
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Menu>
          <Menu
            width={210}
            align="end"
            trigger={({ toggle, open }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                {t("clients.sortPrefix")} {t(SORTS[sort].label)}
              </button>
            )}
          >
            {(close) =>
              (Object.keys(SORTS) as SortKey[]).map((k) => (
                <MenuItem key={k} selected={sort === k} onSelect={() => { setSort(k); close(); }}>
                  {t(SORTS[k].label)}
                </MenuItem>
              ))
            }
          </Menu>
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("clients.col.client")}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("clients.col.plan")}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">
                {t("health.column")}
              </th>
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted">
                MRR
              </th>
              <th className="hidden px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted lg:table-cell">
                {t("clients.col.adBudget")}
              </th>
              <th className="hidden px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted md:table-cell">
                {t("clients.col.leads")}
              </th>
              <th className="hidden px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted xl:table-cell">
                {t("clients.col.trend")}
              </th>
              <th className="hidden px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted lg:table-cell">
                {t("clients.col.team")}
              </th>
              <th className="hidden px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted md:table-cell">
                {t("clients.col.since")}
              </th>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((client, i) => (
              <motion.tr
                key={client.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="group border-b border-border/50 last:border-0 hover:bg-surface-2/50"
              >
                {/* Client name + subtitle */}
                <td className="px-4 py-3">
                  <Link
                    href={`/internal/clients/${client.id}`}
                    className="flex items-center gap-3"
                  >
                    <Avatar name={client.company} size={36} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {client.company}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {client.name}
                      </p>
                    </div>
                  </Link>
                </td>

                {/* Plan */}
                <td className="px-4 py-3">
                  <Badge
                    variant={PLAN_VARIANT[client.plan] ?? "neutral"}
                    className="text-[10px]"
                  >
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                    {client.plan}
                  </Badge>
                </td>

                {/* Health */}
                <td className="px-4 py-3">
                  <HealthBadge health={health[client.id]} />
                </td>

                {/* MRR */}
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {client.mrr > 0
                    ? formatCurrency(client.mrr)
                    : t("clients.na")}
                </td>

                {/* Ad budget 30d */}
                <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                  {client.spend30d > 0
                    ? formatCurrency(client.spend30d)
                    : `0 €`}
                </td>

                {/* Leads */}
                <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                  {client.leads30d}
                </td>

                {/* 30-day sparkline */}
                <td className="hidden px-4 py-3 xl:table-cell">
                  <Sparkline data={client.series30d} />
                </td>

                {/* Team avatars */}
                <td className="hidden px-4 py-3 lg:table-cell">
                  <div className="flex -space-x-1.5">
                    {client.assignedTeam.slice(0, 3).map((m) => (
                      <Avatar
                        key={m.id}
                        name={m.name}
                        size={28}
                        className="ring-2 ring-surface"
                      />
                    ))}
                  </div>
                </td>

                {/* Since */}
                <td className="hidden px-4 py-3 text-right text-xs text-muted md:table-cell">
                  {new Date(client.created_at).toLocaleDateString("de-DE", {
                    month: "long",
                    year: "numeric",
                  })}
                </td>

                {/* Arrow / restore */}
                <td className="px-4 py-3 text-right">
                  {client.archived_at && canArchive ? (
                    <button
                      type="button"
                      onClick={() => restore(client.id)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-2"
                    >
                      {t("clients.restore")}
                    </button>
                  ) : null}
                  <Link
                    href={`/internal/clients/${client.id}`}
                    className="inline-flex items-center text-muted transition-colors group-hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-muted">
            {t("clients.noResults")}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-muted">
            {t("clients.total", { n: filtered.length })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setShowNewClient(true)}>
            {t("clients.addClient")}
          </Button>
        </div>
      </div>
    </div>
  );
}
