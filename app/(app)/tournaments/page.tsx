import { listTournaments } from "@/lib/queries/tournament";
import { TournamentCard } from "@/components/tournament-card";
import Link from "next/link";

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; format?: string }>;
}) {
  const params = await searchParams;
  const tournaments = await listTournaments({
    status: params.status,
    format: params.format,
  });

  // Separate active from past
  const active = tournaments.filter(
    (t) => !["completed", "cancelled"].includes(t.status)
  );
  const past = tournaments.filter((t) =>
    ["completed", "cancelled"].includes(t.status)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Tournaments</h1>
        <Link href="/tournaments/new" className="btn-primary">
          Create Tournament
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" href="/tournaments" active={!params.status && !params.format} />
        <FilterPill label="Open Registration" href="/tournaments?status=registration_open" active={params.status === "registration_open"} />
        <FilterPill label="In Progress" href="/tournaments?status=in_progress" active={params.status === "in_progress"} />
        <FilterPill label="Completed" href="/tournaments?status=completed" active={params.status === "completed"} />
      </div>

      {/* Active Tournaments */}
      {active.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-200 mb-3 uppercase tracking-wider">Upcoming & Active</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </div>
      )}

      {/* Past Tournaments */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-dark-200 mb-3 uppercase tracking-wider">Past</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </div>
      )}

      {tournaments.length === 0 && (
        <div className="card text-center text-surface-muted py-12">
          <p>No tournaments yet. Be the first to create one!</p>
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-brand-900/50 text-brand-300 ring-1 ring-brand-500"
          : "bg-surface-overlay text-surface-muted hover:text-dark-200"
      }`}
    >
      {label}
    </Link>
  );
}
