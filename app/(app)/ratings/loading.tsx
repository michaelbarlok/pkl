export default function RatingsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-surface-border">
        <div className="p-5 sm:p-6 space-y-3">
          <div className="skeleton h-3.5 w-24" />
          <div className="skeleton h-8 w-40" />
          <div className="space-y-2">
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-4/5" />
          </div>
        </div>
        <div className="border-t border-surface-border px-5 sm:px-6 py-3 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-5 w-14" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="border-b border-surface-border px-4 py-3">
          <div className="skeleton h-4 w-24" />
        </div>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-surface-border last:border-0">
            <div className="skeleton h-7 w-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-32" />
            </div>
            <div className="skeleton h-5 w-14 rounded-md" />
            <div className="skeleton h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
