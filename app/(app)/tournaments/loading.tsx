export default function TournamentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-44" />
        <div className="skeleton h-9 w-36 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card space-y-3">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-3/4" />
            <div className="flex items-center justify-between pt-1">
              <div className="skeleton h-5 w-20 rounded-full" />
              <div className="skeleton h-4 w-16" />
            </div>
            <div className="skeleton h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
