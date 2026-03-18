export default function AppLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Page title */}
      <div>
        <div className="h-7 w-56 rounded bg-surface-overlay" />
        <div className="h-4 w-40 rounded bg-surface-overlay mt-2" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="h-4 w-24 rounded bg-surface-overlay mb-2" />
            <div className="h-8 w-16 rounded bg-surface-overlay" />
          </div>
        ))}
      </div>

      {/* Section with header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 rounded bg-surface-overlay" />
          <div className="h-4 w-20 rounded bg-surface-overlay" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="h-5 w-36 rounded bg-surface-overlay mb-2" />
              <div className="h-4 w-48 rounded bg-surface-overlay" />
            </div>
          ))}
        </div>
      </div>

      {/* List section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-36 rounded bg-surface-overlay" />
          <div className="h-4 w-24 rounded bg-surface-overlay" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card flex items-center justify-between">
              <div>
                <div className="h-4 w-40 rounded bg-surface-overlay mb-2" />
                <div className="h-3 w-56 rounded bg-surface-overlay" />
              </div>
              <div className="h-5 w-14 rounded-full bg-surface-overlay" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
