export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-64 rounded-lg bg-surface" />
          <div className="h-4 w-40 rounded-lg bg-surface" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-40 rounded-xl bg-surface" />
          <div className="h-10 w-32 rounded-xl bg-brand/20" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-bg p-5">
            <div className="mb-3 h-3 w-24 rounded bg-surface" />
            <div className="h-8 w-20 rounded-lg bg-surface" />
            <div className="mt-2 h-3 w-16 rounded bg-surface" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="rounded-2xl border border-border bg-bg p-6">
        <div className="mb-4 h-4 w-32 rounded bg-surface" />
        <div className="h-48 w-full rounded-xl bg-surface/60" />
      </div>

      {/* Two-column skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-bg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 rounded bg-surface" />
            <div className="h-4 w-24 rounded bg-surface" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-1 w-1 rounded-full bg-danger" />
              <div className="h-4 flex-1 rounded bg-surface" />
              <div className="h-6 w-16 rounded-lg bg-surface" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-bg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-40 rounded bg-surface" />
            <div className="h-4 w-24 rounded bg-surface" />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-5 w-5 rounded bg-surface" />
              <div className="h-4 flex-1 rounded bg-surface" />
            </div>
          ))}
        </div>
      </div>

      {/* Loading hint */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <span>Zahlen werden aus Search Console geladen …</span>
      </div>
    </div>
  );
}
