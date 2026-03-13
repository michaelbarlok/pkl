import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  draft: "badge-gray",
  registration_open: "badge-blue",
  registration_closed: "badge-yellow",
  in_progress: "badge-green",
  completed: "badge-gray",
  cancelled: "badge-gray",
};

export default async function AdminTournamentsPage() {
  const supabase = await createClient();

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*, creator:profiles!created_by(display_name), registrations:tournament_registrations(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Manage Tournaments</h1>
        <Link href="/tournaments/new" className="btn-primary">
          Create
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Title</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Date</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Status</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Registered</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Creator</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {tournaments?.map((t: any) => (
              <tr key={t.id}>
                <td className="px-2 sm:px-4 py-3 text-sm font-medium text-dark-100">
                  {t.title}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {t.start_date
                    ? new Date(t.start_date + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3">
                  <span className={STATUS_COLORS[t.status] ?? "badge-gray"}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {t.registrations?.[0]?.count ?? 0}
                  {t.player_cap ? `/${t.player_cap}` : ""}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {t.creator?.display_name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm">
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="text-brand-600 hover:text-brand-500"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {(!tournaments || tournaments.length === 0) && (
              <tr>
                <td colSpan={6} className="px-2 sm:px-4 py-8 text-center text-surface-muted">
                  No tournaments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
