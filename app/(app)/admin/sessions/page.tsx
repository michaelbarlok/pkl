import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminSessionsPage() {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("shootout_sessions")
    .select(`
      *,
      sheet:signup_sheets(event_date, location),
      group:shootout_groups(name, slug),
      participants:session_participants(count)
    `)
    .order("created_at", { ascending: false });

  const statusColors: Record<string, string> = {
    created: "badge-gray",
    checking_in: "badge-blue",
    seeding: "badge-yellow",
    round_active: "badge-green",
    round_complete: "badge-yellow",
    session_complete: "badge-gray",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Shootout Sessions</h1>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Date</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Group</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Status</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Courts</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Round</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium uppercase text-surface-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {sessions?.map((session) => (
              <tr key={session.id}>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-100">
                  {session.sheet?.event_date
                    ? new Date(session.sheet.event_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {session.group?.name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3">
                  <span className={statusColors[session.status] ?? "badge-gray"}>
                    {session.status.replace("_", " ")}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {session.num_courts}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-dark-200">
                  {session.current_round}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm">
                  <Link
                    href={`/admin/sessions/${session.id}`}
                    className="text-brand-600 hover:text-brand-500"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {(!sessions || sessions.length === 0) && (
              <tr>
                <td colSpan={6} className="px-2 sm:px-4 py-8 text-center text-surface-muted">
                  No sessions yet. Start a shootout from a sign-up sheet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
