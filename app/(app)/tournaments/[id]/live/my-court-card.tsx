import { getDivisionLabel } from "@/lib/divisions";
import { tournamentHeroGradient } from "@/lib/tournament-hero";
import { FirstChoiceBadge } from "@/components/first-choice-badge";

interface OnCourtMatch {
  id: string;
  court_number: number;
  division: string | null;
  round: number;
  bracket: string;
  partner_name: string | null;
  opponent_team: string | null;
  /** True = our team has first choice; false = opponents do; null
   *  = unresolved (mostly playoffs with seeds not yet stamped). */
  youHaveFirstChoice?: boolean | null;
}

interface Props {
  match: OnCourtMatch | null;
  tournamentId: string;
  numCourts: number | null;
  /** 1-based position in the FIFO queue, or null if the viewer's
   *  team isn't currently queued (e.g. between rounds, or playing). */
  queuePosition?: number | null;
  /** Total waiting matches across active divisions. */
  queueSize?: number;
}

/**
 * Hero card pinned to the top of the player live view.
 *
 * When the viewer's team is currently assigned to a court, the card
 * switches to a colored gradient — mirrors the tournament detail
 * hero so players instantly recognize "it's my turn" state. Court
 * number is the dominant visual.
 *
 * When they're waiting, the card is neutral surface-colored and
 * shows their position in the queue — no visual urgency so they
 * aren't constantly reminded it's not their turn.
 */
export function MyCourtCard({
  match,
  tournamentId,
  numCourts,
  queuePosition,
  queueSize,
}: Props) {
  if (!match) {
    // Not active — neutral card with queue position if we have one.
    const label =
      queuePosition && queueSize
        ? `You're ${ordinal(queuePosition)} in the match queue`
        : queuePosition
          ? `You're ${ordinal(queuePosition)} in the match queue`
          : "You don't have a court yet";
    return (
      <div className="card bg-surface-overlay ring-1 ring-surface-border space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-surface-muted">
          Your Court
        </p>
        <p className="text-xl font-bold text-dark-100">{label}</p>
        <p className="text-xs text-surface-muted">
          {queuePosition
            ? "Stay nearby — we'll push you when your court opens."
            : "Keep an eye on the queue below; we'll push you the moment a court opens."}
        </p>
      </div>
    );
  }

  // Active on court — colored hero, mirrors the tournament detail card.
  const heroTint = tournamentHeroGradient(tournamentId);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroTint} ring-1 ring-surface-border`}
    >
      <div className="p-5 sm:p-6 space-y-3">
        {/* Label + all secondary text on the gradient use text-dark-200
            (adaptive: light on dark mode, dark on light mode). The
            previous text-brand-vivid / text-surface-muted both fell
            below AA contrast against the colored tint in light mode. */}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-200">
          Your Court
        </p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-4xl sm:text-5xl font-bold text-dark-100 leading-none">
            Court {match.court_number}
          </p>
          {numCourts && (
            <p className="text-xs text-dark-200">of {numCourts}</p>
          )}
        </div>
        <div className="text-sm text-dark-200 space-y-0.5">
          {match.partner_name && (
            <p>
              <span className="text-dark-200">Partner:</span>{" "}
              <span className="text-dark-100 font-medium">{match.partner_name}</span>
            </p>
          )}
          {match.opponent_team && (
            <p>
              <span className="text-dark-200">Opponent:</span>{" "}
              <span className="text-dark-100 font-medium">{match.opponent_team}</span>
            </p>
          )}
          {match.youHaveFirstChoice != null && (
            <p className="pt-1 flex items-center gap-1.5">
              <span className="text-dark-200">First choice:</span>
              <span className="text-dark-100 font-medium">
                {match.youHaveFirstChoice ? "you" : "opponents"}
              </span>
              {match.youHaveFirstChoice && <FirstChoiceBadge />}
            </p>
          )}
        </div>
        <p className="text-xs text-dark-200">
          {match.division ? getDivisionLabel(match.division) : ""} ·{" "}
          {bracketLabel(match.bracket)} · Round {match.round}
        </p>
        <p className="text-[11px] text-dark-200">
          Head to the court now. When the match is over, a member of the winning team is responsible for reporting the score to organizers.
        </p>
      </div>
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
