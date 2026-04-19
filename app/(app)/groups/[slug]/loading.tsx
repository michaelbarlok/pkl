export default function GroupLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero card */}
      <div className="rounded-2xl bg-surface-raised ring-1 ring-surface-border overflow-hidden">
        <div className="skeleton h-1.5 w-full" />
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="skeleton h-3.5 w-24" />
              <div className="skeleton h-8 w-56" />
              <div className="skeleton h-3.5 w-40" />
              <div className="skeleton h-16 w-full rounded-lg mt-2" />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="skeleton h-5 w-16 rounded-full" />
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-9 w-24 rounded-lg" />
            <div className="skeleton h-9 w-28 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-surface-border pb-1">
        <div className="skeleton h-8 w-20 rounded-md" />
        <div className="skeleton h-8 w-24 rounded-md" />
        <div className="skeleton h-8 w-16 rounded-md" />
      </div>

      {/* Overview grid */}
      <div className="pt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card card-static space-y-2">
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
