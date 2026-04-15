export default function AdminMembersLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="skeleton h-9 w-28 rounded-lg" />
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-surface-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {["Member", "Email", "Groups", "Joined", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left">
                  <div className="skeleton h-3.5 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <tr key={i} className="border-t border-surface-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="skeleton h-4 w-32" />
                  </div>
                </td>
                <td className="px-4 py-3"><div className="skeleton h-4 w-40" /></td>
                <td className="px-4 py-3"><div className="skeleton h-4 w-24" /></td>
                <td className="px-4 py-3"><div className="skeleton h-4 w-20" /></td>
                <td className="px-4 py-3"><div className="skeleton h-7 w-16 rounded-lg" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
