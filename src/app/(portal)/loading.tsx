// Shared by every portal route, so it stays generic (no page-specific copy).
// Cards match the real ones: white surface on the page background, bars in surface-2.
const bar = "rounded bg-surface-2";

export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className={`h-7 w-64 rounded-lg ${bar}`} />
          <div className={`h-4 w-40 ${bar}`} />
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <div className={`h-10 w-40 rounded-xl ${bar}`} />
          <div className="h-10 w-32 rounded-xl bg-brand/20" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5">
            <div className={`mb-3 h-3 w-24 ${bar}`} />
            <div className={`h-8 w-20 rounded-lg ${bar}`} />
            <div className={`mt-2 h-3 w-16 ${bar}`} />
          </div>
        ))}
      </div>

      <div className="card p-6">
        <div className={`mb-4 h-4 w-32 ${bar}`} />
        <div className="h-48 w-full rounded-xl bg-surface-2/70" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[3, 4].map((rows) => (
          <div key={rows} className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className={`h-4 w-40 ${bar}`} />
              <div className={`h-4 w-24 ${bar}`} />
            </div>
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`h-5 w-5 ${bar}`} />
                <div className={`h-4 flex-1 ${bar}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
