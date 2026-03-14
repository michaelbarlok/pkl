import Link from "next/link";
import type { TournamentWithCounts } from "@/lib/queries/tournament";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elim",
  double_elimination: "Double Elim",
  round_robin: "Round Robin",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-overlay text-dark-200",
  registration_open: "bg-teal-900/30 text-teal-300",
  registration_closed: "bg-brand-900/40 text-brand-300",
  in_progress: "bg-accent-900/40 text-accent-300",
  completed: "bg-surface-overlay text-dark-200",
  cancelled: "bg-red-900/30 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function TournamentCard({ tournament }: { tournament: TournamentWithCounts }) {
  const t = tournament;

  return (
    <Link
      href={`/tournaments/${t.id}`}
      className="card hover:ring-1 hover:ring-brand-500/30 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-semibold text-dark-100 line-clamp-2">{t.title}</h3>
        <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ""}`}>
          {STATUS_LABELS[t.status] ?? t.status}
        </span>
      </div>

      <div className="space-y-1 text-sm text-surface-muted">
        <p>
          {new Date(t.start_date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          {t.start_time && ` at ${t.start_time.slice(0, 5)}`}
        </p>
        <p>{t.location}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-dark-200">
          {FORMAT_LABELS[t.format] ?? t.format}
        </span>
        <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-dark-200 capitalize">
          {t.type}
        </span>
        {t.divisions && t.divisions.length > 0 && (
          <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium text-dark-200">
            {t.divisions.length} division{t.divisions.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border">
        <span className="text-xs text-surface-muted">
          {t.registration_count} registered{t.player_cap ? ` / ${t.player_cap}` : ""}
        </span>
        <span className="text-xs text-surface-muted">
          by {t.creator?.display_name ?? "Unknown"}
        </span>
      </div>
    </Link>
  );
}
