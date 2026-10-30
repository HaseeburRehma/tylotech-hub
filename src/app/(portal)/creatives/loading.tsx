// Creatives while the server loads: the page's own shape (filters, chart, folders, grid).
const bar = "rounded bg-surface-2";

export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className={`h-7 w-40 rounded-lg ${bar}`} />
          <div className={`h-4 w-72 ${bar}`} />
        </div>
        <div className="hidden gap-2 sm:flex">
          <div className={`h-11 w-36 rounded-xl ${bar}`} />
          <div className="h-11 w-28 rounded-xl bg-brand/20" />
        </div>
      </div>
      <div className="card flex flex-wrap gap-2 p-3">
        {[120, 170, 180, 110, 150].map((w, i) => (
          <div key={i} className={`h-10 rounded-xl ${bar}`} style={{ width: w }} />
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="space-y-2 border-b border-line px-5 py-4">
          <div className={`h-4 w-44 ${bar}`} />
          <div className={`h-3 w-full max-w-xl ${bar}`} />
        </div>
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 bg-surface px-5 py-4">
              <div className={`h-3 w-20 ${bar}`} />
              <div className={`h-7 w-14 rounded-lg ${bar}`} />
            </div>
          ))}
        </div>
        <div className="flex h-[240px] items-end gap-3 px-5 pb-6 pt-4 sm:h-[300px]">
          {[30, 45, 50, 55, 70, 75, 68, 90, 100, 20, 8, 8].map((h, i) => (
            <div key={i} className={`flex-1 rounded-t ${bar}`} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="card hidden space-y-2 p-3 lg:block">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-8 rounded-lg ${bar}`} />
          ))}
        </div>
        <div className="card p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className={`aspect-square rounded-xl ${bar}`} />
                <div className={`h-3 w-3/4 ${bar}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
