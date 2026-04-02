export default function AppLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page title */}
      <div>
        <div className="skeleton h-7 w-56 mb-2" />
        <div className="skeleton h-4 w-40" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card space-y-2">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Card grid section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-5 w-28" />
          <div className="skeleton h-4 w-20" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card space-y-2">
              <div className="skeleton h-5 w-36" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>

      {/* List section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-4 w-24" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card flex items-center justify-between">
              <div className="space-y-2">
                <div className="skeleton h-4 w-40" />
                <div className="skeleton h-3 w-56" />
              </div>
              <div className="skeleton h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
