export default function ForumLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-surface-overlay" />
        <div className="h-9 w-28 rounded bg-surface-overlay" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card">
            <div className="h-5 w-3/4 rounded bg-surface-overlay mb-2" />
            <div className="h-4 w-1/3 rounded bg-surface-overlay" />
          </div>
        ))}
      </div>
    </div>
  );
}
