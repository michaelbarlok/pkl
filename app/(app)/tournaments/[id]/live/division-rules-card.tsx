import { getDivisionLabel } from "@/lib/divisions";

interface Props {
  division: string;
  format: string;
  scoreToWinPool?: number;
  scoreToWinPlayoff?: number;
  finalsBestOf3?: boolean;
  divisionSettings: {
    games_per_team?: number;
    num_pools?: number;
    playoff_advancing?: number;
  } | null;
}

/**
 * Rules panel shown at the top of the player live view. Renders
 * format, scoring, and the fixed tiebreaker stack. The copy is
 * deliberately explicit about the coin-flip being stable (so a
 * player who refreshes doesn't see their position change).
 */
export function DivisionRulesCard({
  division,
  format,
  scoreToWinPool,
  scoreToWinPlayoff,
  finalsBestOf3,
  divisionSettings,
}: Props) {
  const isRoundRobin = format === "round_robin";
  const playoffAdvancing = divisionSettings?.playoff_advancing;
  const gamesPerTeam = divisionSettings?.games_per_team;

  return (
    <div className="card border border-brand-500/30 space-y-3">
      <h2 className="text-sm font-semibold text-dark-100">
        {getDivisionLabel(division)} — Rules
      </h2>

      <dl className="text-xs text-dark-200 space-y-1.5">
        {isRoundRobin ? (
          <>
            <div>
              <dt className="inline font-medium">Format:</dt>{" "}
              <dd className="inline text-surface-muted">
                Round robin pool play followed by a seeded playoff bracket.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Pool play games to:</dt>{" "}
              <dd className="inline text-surface-muted">{scoreToWinPool ?? 11}</dd>
              <span className="text-surface-border mx-1.5">·</span>
              <dt className="inline font-medium">Playoff games to:</dt>{" "}
              <dd className="inline text-surface-muted">{scoreToWinPlayoff ?? 11}</dd>
            </div>
            {gamesPerTeam && (
              <div>
                <dt className="inline font-medium">Pool play games per team:</dt>{" "}
                <dd className="inline text-surface-muted">{gamesPerTeam}</dd>
              </div>
            )}
            {playoffAdvancing && (
              <div>
                <dt className="inline font-medium">Playoff advancement:</dt>{" "}
                <dd className="inline text-surface-muted">
                  top {playoffAdvancing} per pool
                </dd>
              </div>
            )}
            {finalsBestOf3 && (
              <div>
                <dt className="inline font-medium">Championship final:</dt>{" "}
                <dd className="inline text-surface-muted">Best 2 of 3 games</dd>
              </div>
            )}
          </>
        ) : (
          <div>
            <dt className="inline font-medium">Format:</dt>{" "}
            <dd className="inline text-surface-muted">
              {format === "double_elimination" ? "Double" : "Single"} elimination bracket.
            </dd>
          </div>
        )}
      </dl>

      {/* Score-reporting etiquette — organizers own the data entry,
          but someone on the winning team has to carry the result
          back so the court can get its next match. */}
      <div className="border-t border-surface-border pt-2.5">
        <p className="text-xs text-dark-200">
          <span className="font-medium text-accent-300">Winning team:</span>{" "}
          please report the final score to an organizer after the match. The
          organizer enters it, your court frees up, and the queue promotes
          the next match automatically.
        </p>
      </div>

      {isRoundRobin && (
        <div className="border-t border-surface-border pt-2.5 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-muted">
            Pool play tiebreakers (in order)
          </p>
          <ol className="text-xs text-dark-200 list-decimal pl-5 space-y-0.5">
            <li>Win–loss record</li>
            <li>Point differential</li>
            <li>Head-to-head record (among tied teams only)</li>
            <li>Head-to-head point differential (among tied teams only)</li>
            <li>Coin flip — set at bracket creation so it doesn&apos;t change on refresh</li>
          </ol>
        </div>
      )}
    </div>
  );
}
