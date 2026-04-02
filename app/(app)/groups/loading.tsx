export default function GroupsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card space-y-2.5">
            <div className="skeleton h-6 w-36" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-5 w-16 rounded-full mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
