export default function TournamentLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="skeleton h-3.5 w-40" />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-surface-border">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="skeleton h-5 w-32 rounded-full" />
              <div className="skeleton h-8 w-72" />
              <div className="skeleton h-4 w-52" />
              <div className="flex gap-1.5 pt-1">
                <div className="skeleton h-5 w-24 rounded-full" />
                <div className="skeleton h-5 w-16 rounded-full" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            </div>
            <div className="shrink-0 text-right space-y-2">
              <div className="skeleton h-3 w-10 ml-auto" />
              <div className="skeleton h-12 w-16 ml-auto" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <div className="skeleton h-8 w-20 rounded-lg" />
            <div className="skeleton h-8 w-16 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Details card */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-4 w-40" />
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-surface-border space-y-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
