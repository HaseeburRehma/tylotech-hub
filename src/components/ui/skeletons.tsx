// Route loading skeletons. Each mirrors its page's real layout (cards on the
// page background, bars in surface-2) so the content swaps in without a jump.
// Server components: no client JS, they stream in the first frame.
import { cn } from "@/lib/utils";

const bar = "rounded bg-surface-2";

export function Bar({ className }: { className?: string }) {
  return <div className={cn(bar, className)} />;
}

function Shell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Page title, subtitle and up to two header buttons. */
export function HeaderSkeleton({ actions = 2 }: { actions?: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <Bar className="h-7 w-56 rounded-lg" />
        <Bar className="h-4 w-72 max-w-[60vw]" />
      </div>
      {actions > 0 && (
        <div className="hidden items-center gap-3 sm:flex">
          {Array.from({ length: actions - 1 }, (_, i) => (
            <Bar key={i} className="h-10 w-32 rounded-xl" />
          ))}
          <div className="h-10 w-32 rounded-xl bg-brand/20" />
        </div>
      )}
    </div>
  );
}

/** Row of small stat tiles (count of `n`). */
export function StatTilesSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4", n >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Bar className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Bar className="h-6 w-12 rounded-md" />
            <Bar className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Search + filters bar above a list. */
export function FilterBarSkeleton({ filters = 3 }: { filters?: number }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-line p-4">
      <Bar className="h-10 min-w-[220px] flex-1 rounded-xl" />
      {Array.from({ length: filters }, (_, i) => (
        <Bar key={i} className="h-10 w-36 rounded-xl" />
      ))}
    </div>
  );
}

/** List rows with an avatar, two lines and a trailing badge. */
export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Bar className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className={cn("h-4", i % 3 === 0 ? "w-48" : i % 3 === 1 ? "w-64" : "w-40")} />
            <Bar className="h-3 w-32" />
          </div>
          <Bar className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Generic list page: header, optional stat tiles, a card with filters and rows. */
export function ListPageSkeleton({ label, stats = 0, filters = 3, rows = 8 }: { label: string; stats?: number; filters?: number; rows?: number }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton />
      {stats > 0 && <StatTilesSkeleton n={stats} />}
      <div className="card overflow-hidden">
        {filters > 0 && <FilterBarSkeleton filters={filters} />}
        <RowsSkeleton rows={rows} />
      </div>
    </Shell>
  );
}

/** Grid of cards (projects, AI tools, integrations). */
export function CardGridSkeleton({ label, cards = 6, columns = 3 }: { label: string; cards?: number; columns?: 2 | 3 }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton actions={1} />
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Bar className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Bar className="h-4 w-36" />
                <Bar className="h-3 w-24" />
              </div>
            </div>
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-4/5" />
            <Bar className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Chat: conversation list, message bubbles and the composer. */
export function ChatSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-[calc(100dvh-8rem)] animate-pulse gap-4" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="card hidden w-72 shrink-0 flex-col md:flex">
        <div className="border-b border-line p-4">
          <Bar className="h-10 w-full rounded-xl" />
        </div>
        <div className="space-y-1 p-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
              <Bar className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bar className="h-3.5 w-28" />
                <Bar className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Bar className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Bar className="h-4 w-40" />
            <Bar className="h-3 w-28" />
          </div>
        </div>
        <div className="flex-1 space-y-5 overflow-hidden p-5">
          {[
            { mine: false, w: "w-64" },
            { mine: false, w: "w-48" },
            { mine: true, w: "w-56" },
            { mine: false, w: "w-72" },
            { mine: true, w: "w-40" },
          ].map((b, i) => (
            <div key={i} className={cn("flex items-end gap-2", b.mine && "justify-end")}>
              {!b.mine && <Bar className="h-7 w-7 rounded-full" />}
              <div className={cn("h-12 max-w-[70%] rounded-2xl", b.w, b.mine ? "bg-brand/15" : "bg-surface-2")} />
            </div>
          ))}
        </div>
        <div className="border-t border-line p-4">
          <Bar className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Settings-style forms: stacked cards with labels and inputs. */
export function FormPageSkeleton({ label, sections = 3 }: { label: string; sections?: number }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton actions={0} />
      {Array.from({ length: sections }, (_, s) => (
        <div key={s} className="card space-y-4 p-6">
          <Bar className="h-5 w-40" />
          {[0, 1].map((f) => (
            <div key={f} className="space-y-2">
              <Bar className="h-3 w-24" />
              <Bar className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ))}
    </Shell>
  );
}

/** Performance: tabs, KPI tiles and two charts. */
export function ChartsPageSkeleton({ label }: { label: string }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton />
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Bar key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>
      <StatTilesSkeleton n={4} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card p-6">
            <Bar className="mb-4 h-4 w-32" />
            <div className="h-56 w-full rounded-xl bg-surface-2/70" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Dashboards: KPI cards, the main chart and two side-by-side lists. */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5">
            <Bar className="mb-3 h-3 w-24" />
            <Bar className="h-8 w-20 rounded-lg" />
            <Bar className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="card p-6">
        <Bar className="mb-4 h-4 w-32" />
        <div className="h-56 w-full rounded-xl bg-surface-2/70" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[3, 4].map((rows) => (
          <div key={rows} className="card overflow-hidden">
            <div className="border-b border-line p-4">
              <Bar className="h-4 w-40" />
            </div>
            <RowsSkeleton rows={rows} />
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** Kanban-style boards (internal hub pipeline, processes): stat tiles, then columns of cards. */
export function BoardSkeleton({ label, stats = 0, columns = 4 }: { label: string; stats?: number; columns?: number }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton />
      {stats > 0 && <StatTilesSkeleton n={stats} />}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <Bar key={i} className="h-9 w-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: columns }, (_, c) => (
          <div key={c} className={cn("card space-y-3 p-3", c >= 2 && "hidden xl:block")}>
            <div className="flex items-center justify-between px-1">
              <Bar className="h-4 w-24" />
              <Bar className="h-5 w-8 rounded-full" />
            </div>
            {Array.from({ length: 3 - (c % 2) }, (_, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                <Bar className="h-4 w-3/4" />
                <div className="flex items-center gap-2">
                  <Bar className="h-5 w-5 rounded-full" />
                  <Bar className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/** One record (a partner, a process run): avatar header, tabs, then content cards. */
export function DetailSkeleton({ label, tabs = 5 }: { label: string; tabs?: number }) {
  return (
    <Shell label={label}>
      <Bar className="h-4 w-28" />
      <div className="flex items-center gap-4">
        <Bar className="h-14 w-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Bar className="h-7 w-56 rounded-lg" />
          <Bar className="h-4 w-40" />
        </div>
        <div className="hidden h-10 w-32 rounded-xl bg-brand/20 sm:block" />
      </div>
      {tabs > 0 && (
        <div className="flex gap-2 overflow-hidden border-b border-line pb-3">
          {Array.from({ length: tabs }, (_, i) => (
            <Bar key={i} className="h-8 w-24 shrink-0 rounded-lg" />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card overflow-hidden">
          <div className="border-b border-line p-4">
            <Bar className="h-4 w-40" />
          </div>
          <RowsSkeleton rows={5} />
        </div>
        <div className="card space-y-4 p-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3 w-20" />
              <Bar className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** AI tool: the input form beside the output panel. */
export function ComposerSkeleton({ label }: { label: string }) {
  return (
    <Shell label={label}>
      <HeaderSkeleton actions={1} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <div className="card space-y-4 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3 w-28" />
              <Bar className={cn("w-full rounded-xl", i === 0 ? "h-24" : "h-10")} />
            </div>
          ))}
          <div className="h-11 w-full rounded-xl bg-brand/20" />
        </div>
        <div className="card min-h-[320px] space-y-3 p-5">
          <Bar className="h-4 w-32" />
          <div className="h-full min-h-[240px] w-full rounded-xl bg-surface-2/70" />
        </div>
      </div>
    </Shell>
  );
}
