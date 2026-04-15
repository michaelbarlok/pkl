import { createClient } from "@/lib/supabase/server";
import { AdminDeleteButton } from "@/components/delete-tournament-button";
import { HideTournamentToggle } from "./hide-toggle";
import { Breadcrumb } from "@/components/breadcrumb";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

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
      <Breadcrumb items={[{ label: "Admin" }, { label: "Tournaments" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Manage Tournaments</h1>
          <p className="mt-1 text-sm text-surface-muted">View, hide, and delete all tournaments across the platform.</p>
        </div>
        <Link href="/tournaments/new" className="btn-primary">
          Create
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Title</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Date</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Status</th>
              <th className="hidden sm:table-cell px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Registered</th>
              <th className="hidden sm:table-cell px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Creator</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Visibility</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Actions</th>
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
                    ? formatDate(t.start_date + "T00:00:00")
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3">
                  <span className={STATUS_COLORS[t.status] ?? "badge-gray"}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="hidden sm:table-cell whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {t.registrations?.[0]?.count ?? 0}
                  {t.player_cap ? `/${t.player_cap}` : ""}
                </td>
                <td className="hidden sm:table-cell whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {t.creator?.display_name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3">
                  <HideTournamentToggle
                    tournamentId={t.id}
                    isHidden={t.is_hidden ?? false}
                  />
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm space-x-3">
                  <Link
                    href={`/tournaments/${t.id}`}
                    className="text-brand-400 hover:text-brand-300"
                  >
                    View
                  </Link>
                  <AdminDeleteButton tournamentId={t.id} />
                </td>
              </tr>
            ))}
            {(!tournaments || tournaments.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <svg className="mx-auto mb-2 h-8 w-8 text-surface-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.25 9.71 2 12 2c2.291 0 4.545.25 6.75.721v1.515m0 0a48.667 48.667 0 0 1-1.125.738M18.75 4.236V4.5a6.75 6.75 0 0 1-2.48 5.228" />
                  </svg>
                  <p className="text-sm text-surface-muted">No tournaments yet.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
