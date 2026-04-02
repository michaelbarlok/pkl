export default function SheetsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card flex items-center justify-between">
            <div className="space-y-2">
              <div className="skeleton h-5 w-48" />
              <div className="skeleton h-4 w-32" />
            </div>
            <div className="flex items-center gap-3">
              <div className="skeleton h-1.5 w-20 rounded-full" />
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
