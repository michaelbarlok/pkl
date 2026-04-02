export default function PlayerLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="card flex items-center gap-4">
        <div className="skeleton h-16 w-16 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-4 w-24" />
        </div>
      </div>
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card space-y-1.5">
            <div className="skeleton h-3.5 w-16" />
            <div className="skeleton h-7 w-12" />
          </div>
        ))}
      </div>
      {/* Recent activity */}
      <div className="space-y-2">
        <div className="skeleton h-5 w-32 mb-3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="card flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-3.5 w-48" />
            </div>
            <div className="skeleton h-5 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
