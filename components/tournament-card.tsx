import Link from "next/link";
import type { TournamentWithCounts } from "@/lib/queries/tournament";
import { formatDate, formatTime } from "@/lib/utils";
import { TOURNAMENT_STATUS_COLORS, TOURNAMENT_STATUS_LABELS } from "@/lib/status-colors";

const STATUS_ACCENT: Record<string, string> = {
  draft: "card-accent-gray",
  registration_open: "card-accent-green",
  registration_closed: "card-accent-brand",
  in_progress: "card-accent-yellow",
  completed: "card-accent-gray",
  cancelled: "card-accent-red",
};

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elim",
  double_elimination: "Double Elim",
  round_robin: "Round Robin",
};

export function TournamentCard({ tournament }: { tournament: TournamentWithCounts }) {
  const t = tournament;
  const isOpen = t.status === "registration_open";
  const accent = STATUS_ACCENT[t.status] ?? "card-accent-gray";
  const fillPct = t.player_cap && t.registration_count != null
    ? Math.min((t.registration_count / t.player_cap) * 100, 100)
    : null;

  return (
    <div className={`card hover:ring-1 hover:ring-brand-500/30 transition-all flex flex-col ${accent}`}>
      <Link href={`/tournaments/${t.id}`} className="flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-base font-semibold text-dark-100 line-clamp-2">{t.title}</h3>
          <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TOURNAMENT_STATUS_COLORS[t.status] ?? ""}`}>
            {TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}
          </span>
        </div>

        <div className="space-y-1 text-sm text-surface-muted">
          <p>
            {formatDate(t.start_date + "T00:00:00")}
            {t.start_time && ` at ${formatTime(t.start_time)}`}
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

        <div className="mt-3 pt-3 border-t border-surface-border space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-muted">
              {t.registration_count} registered{t.player_cap ? ` / ${t.player_cap}` : ""}
            </span>
            <span className="text-xs text-surface-muted">
              by {t.creator?.display_name ?? "Unknown"}
            </span>
          </div>
          {fillPct !== null && (
            <div className="h-1.5 w-full rounded-full bg-surface-overlay overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fillPct >= 100 ? "bg-accent-400" : "bg-teal-400"}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          )}
        </div>
      </Link>

      {isOpen && (
        <Link
          href={`/tournaments/${t.id}#register`}
          className="btn-primary w-full text-center mt-3"
        >
          Register
        </Link>
      )}
    </div>
  );
}
