export default function GroupsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-40 rounded bg-surface-overlay" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="h-6 w-32 rounded bg-surface-overlay mb-2" />
            <div className="h-4 w-full rounded bg-surface-overlay mb-1" />
            <div className="h-4 w-3/4 rounded bg-surface-overlay" />
          </div>
        ))}
      </div>
    </div>
  );
}
