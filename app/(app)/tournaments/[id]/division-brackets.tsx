"use client";

import { useMemo, useState } from "react";
import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import type { TournamentMatch, TournamentFormat } from "@/types/database";
import { getDivisionLabel } from "@/lib/divisions";

interface DivisionEntry {
  division: string;
  matches: TournamentMatch[];
}

type DivisionStatus = "live" | "upcoming" | "complete";

interface Props {
  divisionMatchesEntries: DivisionEntry[];
  tournament: {
    format: TournamentFormat;
    score_to_win_pool?: number;
    score_to_win_playoff?: number;
    finals_best_of_3?: boolean;
  };
  canManage: boolean;
  tournamentId: string;
  myDivision?: string;
  partnerMap: PartnerMap;
  isRoundRobin: boolean;
  /** Divisions currently in tournament_active_divisions. */
  activeDivisions?: string[];
  /** Per-division setting overrides (score_to_win, etc.). Resolved
   *  at render time so each tab shows its own scores. */
  divisionSettings?: Record<
    string,
    {
      score_to_win_pool?: number;
      score_to_win_playoff?: number;
    } | null
  > | null;
}

function divisionStatus(
  entry: DivisionEntry,
  activeSet: Set<string>
): DivisionStatus {
  if (entry.matches.length === 0) return "upcoming";
  const allDone = entry.matches.every(
    (m) => m.status === "completed" || m.status === "bye"
  );
  if (allDone) return "complete";
  if (activeSet.has(entry.division)) return "live";
  return "upcoming";
}

export function DivisionBrackets({
  divisionMatchesEntries,
  tournament,
  canManage,
  tournamentId,
  myDivision,
  partnerMap,
  isRoundRobin,
  activeDivisions,
  divisionSettings,
}: Props) {
  function resolvedScores(division: string) {
    const override = divisionSettings?.[division];
    return {
      pool: override?.score_to_win_pool ?? tournament.score_to_win_pool,
      playoff: override?.score_to_win_playoff ?? tournament.score_to_win_playoff,
    };
  }
  const activeSet = useMemo(
    () => new Set(activeDivisions ?? []),
    [activeDivisions]
  );

  // Reorder the tabs: live first, then upcoming, then complete. Keep
  // the input order stable within each bucket. A stable sort is
  // guaranteed in ES2019+, which is what Next targets.
  const orderedEntries = useMemo(() => {
    const rank: Record<DivisionStatus, number> = {
      live: 0,
      upcoming: 1,
      complete: 2,
    };
    return [...divisionMatchesEntries].sort(
      (a, b) => rank[divisionStatus(a, activeSet)] - rank[divisionStatus(b, activeSet)]
    );
  }, [divisionMatchesEntries, activeSet]);

  const hasMultipleDivisions = orderedEntries.length > 1;

  // Default to user's division, or first division in the reordered
  // list (which is now the first live division if any).
  const [selectedDivision, setSelectedDivision] = useState<string>(
    myDivision && orderedEntries.some((e) => e.division === myDivision)
      ? myDivision
      : orderedEntries[0]?.division ?? "__none__"
  );

  // Single division — no tabs needed
  if (!hasMultipleDivisions) {
    const entry = orderedEntries[0];
    if (!entry) return null;
    const scores = resolvedScores(entry.division);
    return (
      <div>
        <h2 className="text-lg font-semibold text-dark-100 mb-3">
          {entry.division === "__none__" ? "Bracket" : getDivisionLabel(entry.division)}
        </h2>
        {isRoundRobin && (
          <DivisionRules
            division={entry.division}
            scoreToWinPool={scores.pool}
            scoreToWinPlayoff={scores.playoff}
            finalsBestOf3={tournament.finals_best_of_3}
          />
        )}
        <TournamentBracketView
          matches={entry.matches}
          format={tournament.format}
          canManage={canManage}
          tournamentId={tournamentId}
          division={entry.division === "__none__" ? undefined : entry.division}
          scoreToWinPool={scores.pool}
          scoreToWinPlayoff={scores.playoff}
          finalsBestOf3={tournament.finals_best_of_3}
          partnerMap={partnerMap}
        />
      </div>
    );
  }

  // Multiple divisions — pill/tab navigation
  const selectedEntry = orderedEntries.find((e) => e.division === selectedDivision);

  return (
    <div>
      {/* Division Tabs — live divisions float to the front so the
          organizer can hop between whichever pools are currently
          playing; completed divisions sink to the end with a ✓.  */}
      <div className="flex flex-wrap gap-2 mb-4">
        {orderedEntries.map((entry) => {
          const { division } = entry;
          const isSelected = division === selectedDivision;
          const isMyDiv = division === myDivision;
          const status = divisionStatus(entry, activeSet);

          const base = "rounded-full pl-3 pr-3.5 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5";
          let style: string;
          if (isSelected) {
            style = "bg-brand-500 text-white ring-1 ring-brand-400";
          } else if (status === "live") {
            style = "bg-brand-500/15 text-brand-vivid ring-1 ring-brand-500/40 hover:bg-brand-500/25";
          } else if (status === "complete") {
            // Deprioritised but still legible so organizers can go back
            // and review final standings.
            style = "bg-surface-overlay text-surface-muted ring-1 ring-surface-border hover:text-dark-200";
          } else if (isMyDiv) {
            style = "bg-brand-500/10 text-brand-vivid ring-1 ring-brand-500/30 hover:bg-brand-500/20";
          } else {
            style = "bg-surface-overlay text-dark-100 hover:bg-surface-raised";
          }

          return (
            <button
              key={division}
              onClick={() => setSelectedDivision(division)}
              className={`${base} ${style}`}
              aria-current={isSelected ? "true" : undefined}
            >
              {status === "live" && (
                <span
                  className={
                    "h-1.5 w-1.5 rounded-full animate-pulse " +
                    (isSelected ? "bg-white" : "bg-brand-vivid")
                  }
                  aria-label="Live"
                />
              )}
              {status === "complete" && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  className="h-3 w-3"
                  aria-label="Complete"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
              <span>
                {division === "__none__" ? "All" : getDivisionLabel(division)}
              </span>
              {isMyDiv && !isSelected && (
                <span className="text-[10px] opacity-80">(You)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Division Content */}
      {selectedEntry && (() => {
        const scores = resolvedScores(selectedEntry.division);
        return (
          <div>
            {/* Division Rules */}
            {isRoundRobin && (
              <DivisionRules
                division={selectedEntry.division}
                scoreToWinPool={scores.pool}
                scoreToWinPlayoff={scores.playoff}
                finalsBestOf3={tournament.finals_best_of_3}
              />
            )}

            {/* Bracket */}
            <TournamentBracketView
              matches={selectedEntry.matches}
              format={tournament.format}
              canManage={canManage}
              tournamentId={tournamentId}
              division={selectedEntry.division === "__none__" ? undefined : selectedEntry.division}
              scoreToWinPool={scores.pool}
              scoreToWinPlayoff={scores.playoff}
              finalsBestOf3={tournament.finals_best_of_3}
              partnerMap={partnerMap}
            />
          </div>
        );
      })()}
    </div>
  );
}

function DivisionRules({
  division,
  scoreToWinPool,
  scoreToWinPlayoff,
  finalsBestOf3,
}: {
  division: string;
  scoreToWinPool?: number;
  scoreToWinPlayoff?: number;
  finalsBestOf3?: boolean;
}) {
  return (
    <div className="card border border-brand-300/20 mb-4">
      <h3 className="text-sm font-semibold text-dark-100 mb-2">
        {division === "__none__" ? "Rules" : `${getDivisionLabel(division)} — Rules`}
      </h3>
      <div className="text-xs text-dark-200 space-y-1.5">
        <p>
          <span className="font-medium">Format:</span> Round Robin pool play followed by a seeded playoff bracket.
        </p>
        <p>
          <span className="font-medium">Pool play games to:</span> {scoreToWinPool ?? 11} &mdash;
          <span className="font-medium"> Playoff games to:</span> {scoreToWinPlayoff ?? 11}
        </p>
        {finalsBestOf3 && (
          <p><span className="font-medium">Championship final:</span> Best 2 out of 3 games</p>
        )}
        <p className="text-surface-muted">
          Standings are determined by win-loss record, then point differential. Brackets update live as scores are entered.
        </p>
      </div>
    </div>
  );
}
