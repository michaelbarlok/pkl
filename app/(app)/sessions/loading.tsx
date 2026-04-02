export default function SessionsLoading() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card space-y-2">
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="card space-y-3">
        <div className="skeleton h-4 w-28" />
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-6 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="border-b border-surface-border px-4 py-3">
          <div className="skeleton h-4 w-24" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-surface-border last:border-0">
            <div className="skeleton h-4 w-36" />
            <div className="skeleton h-5 w-10 rounded-full ml-auto" />
            <div className="skeleton h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
