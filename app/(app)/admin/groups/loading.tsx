export default function AdminGroupsLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="skeleton h-9 w-32 rounded-lg" />
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-surface-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {["Name", "Type", "Members", "Status", "Last Session", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left">
                  <div className="skeleton h-3.5 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="border-t border-surface-border">
                <td className="px-4 py-3"><div className="skeleton h-4 w-36" /></td>
                <td className="px-4 py-3"><div className="skeleton h-4 w-20" /></td>
                <td className="px-4 py-3"><div className="skeleton h-4 w-10" /></td>
                <td className="px-4 py-3"><div className="skeleton h-5 w-16 rounded-full" /></td>
                <td className="px-4 py-3"><div className="skeleton h-4 w-24" /></td>
                <td className="px-4 py-3"><div className="skeleton h-7 w-20 rounded-lg" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
