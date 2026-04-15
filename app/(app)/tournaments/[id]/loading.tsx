export default function TournamentLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Breadcrumb */}
      <div className="skeleton h-3.5 w-40" />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-8 w-72" />
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-4 w-56" />
        </div>
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card card-static space-y-2">
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-5 w-32" />
          </div>
        ))}
      </div>

      {/* Description */}
      <div className="card card-static space-y-2">
        <div className="skeleton h-3.5 w-24 mb-3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-3/4" />
      </div>
    </div>
  );
}
