export default function GroupLoading() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-3.5 w-24" />
          <div className="skeleton h-8 w-56" />
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton h-5 w-14 rounded-full" />
          <div className="skeleton h-9 w-24 rounded-lg" />
          <div className="skeleton h-9 w-20 rounded-lg" />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card card-static space-y-2">
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-8 w-12" />
          </div>
        ))}
      </div>

      {/* Members */}
      <div className="space-y-3">
        <div className="skeleton h-5 w-20" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card card-static flex items-center gap-3">
              <div className="skeleton h-8 w-8 rounded-full shrink-0" />
              <div className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
