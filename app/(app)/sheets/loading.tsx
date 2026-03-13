export default function SheetsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-surface-overlay" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-5 w-48 rounded bg-surface-overlay" />
                <div className="h-4 w-32 rounded bg-surface-overlay" />
              </div>
              <div className="h-8 w-20 rounded bg-surface-overlay" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
