import { getDivisionLabel } from "@/lib/divisions";

interface OnCourtMatch {
  id: string;
  court_number: number;
  division: string | null;
  round: number;
  bracket: string;
  partner_name: string | null;
  opponent_team: string | null;
}

interface Props {
  match: OnCourtMatch | null;
  tournamentId: string;
  numCourts: number | null;
}

/**
 * Hero card pinned to the top of the player live view. When the
 * viewer's team is currently assigned to a court, this is the first
 * (and biggest) thing they see — analogous to the Your Court card on
 * the ladder session page.
 *
 * Falls back to a small "no court yet" banner so the area doesn't
 * feel empty when the player is between matches.
 */
export function MyCourtCard({ match, tournamentId, numCourts }: Props) {
  if (!match) {
    return (
      <div className="card bg-surface-overlay text-xs text-surface-muted">
        You don&apos;t have a court yet — keep an eye on the queue below.
        We&apos;ll send a push the moment a court opens up for you.
      </div>
    );
  }

  return (
    <div className="card bg-surface-overlay ring-1 ring-brand-vivid/40 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-vivid">
        Your Court
      </p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <p className="text-3xl sm:text-4xl font-bold text-dark-100 leading-none">
          Court {match.court_number}
        </p>
        {numCourts && (
          <p className="text-xs text-surface-muted">
            of {numCourts}
          </p>
        )}
      </div>
      <div className="text-sm text-dark-200 space-y-0.5">
        {match.partner_name && (
          <p>
            <span className="text-surface-muted">Partner:</span>{" "}
            <span className="text-dark-100 font-medium">{match.partner_name}</span>
          </p>
        )}
        {match.opponent_team && (
          <p>
            <span className="text-surface-muted">Opponent:</span>{" "}
            <span className="text-dark-100 font-medium">{match.opponent_team}</span>
          </p>
        )}
      </div>
      <p className="text-xs text-surface-muted">
        {match.division ? getDivisionLabel(match.division) : ""} ·{" "}
        {bracketLabel(match.bracket)} · Round {match.round}
      </p>
      <p className="text-[11px] text-surface-muted">
        Head to the court now. Your organizer will enter the score when the match wraps.
      </p>
    </div>
  );
}

function bracketLabel(bracket: string): string {
  if (bracket === "playoff") return "Playoff";
  if (bracket === "winners") return "Pool A";
  if (bracket === "losers") return "Pool B";
  if (bracket.startsWith("pool_")) return `Pool ${bracket.slice(5)}`;
  return bracket;
}
