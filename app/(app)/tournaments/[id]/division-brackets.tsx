"use client";

import { useState } from "react";
import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import type { TournamentMatch, TournamentFormat } from "@/types/database";
import { getDivisionLabel } from "@/lib/divisions";

interface DivisionEntry {
  division: string;
  matches: TournamentMatch[];
}

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
}

export function DivisionBrackets({
  divisionMatchesEntries,
  tournament,
  canManage,
  tournamentId,
  myDivision,
  partnerMap,
  isRoundRobin,
}: Props) {
  const hasMultipleDivisions = divisionMatchesEntries.length > 1;

  // Default to user's division, or first division
  const [selectedDivision, setSelectedDivision] = useState<string>(
    myDivision && divisionMatchesEntries.some((e) => e.division === myDivision)
      ? myDivision
      : divisionMatchesEntries[0]?.division ?? "__none__"
  );

  // Single division — no tabs needed
  if (!hasMultipleDivisions) {
    const entry = divisionMatchesEntries[0];
    if (!entry) return null;
    return (
      <div>
        <h2 className="text-lg font-semibold text-dark-100 mb-3">
          {entry.division === "__none__" ? "Bracket" : getDivisionLabel(entry.division)}
        </h2>
        {isRoundRobin && (
          <DivisionRules
            division={entry.division}
            scoreToWinPool={tournament.score_to_win_pool}
            scoreToWinPlayoff={tournament.score_to_win_playoff}
            finalsBestOf3={tournament.finals_best_of_3}
          />
        )}
        <TournamentBracketView
          matches={entry.matches}
          format={tournament.format}
          canManage={canManage}
          tournamentId={tournamentId}
          division={entry.division === "__none__" ? undefined : entry.division}
          scoreToWinPool={tournament.score_to_win_pool}
          scoreToWinPlayoff={tournament.score_to_win_playoff}
          finalsBestOf3={tournament.finals_best_of_3}
          partnerMap={partnerMap}
        />
      </div>
    );
  }

  // Multiple divisions — pill/tab navigation
  const selectedEntry = divisionMatchesEntries.find((e) => e.division === selectedDivision);

  return (
    <div>
      {/* Division Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {divisionMatchesEntries.map(({ division }) => {
          const isActive = division === selectedDivision;
          const isMyDiv = division === myDivision;
          return (
            <button
              key={division}
              onClick={() => setSelectedDivision(division)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? // brand-500 is darker than brand-300; white text stays
                    // legible on it in both themes. brand-300 was too pale
                    // and the white text washed out.
                    "bg-brand-500 text-white ring-1 ring-brand-400"
                  : isMyDiv
                    ? "bg-brand-500/15 text-brand-vivid ring-1 ring-brand-500/40 hover:bg-brand-500/25"
                    : // text-dark-100 is the primary body tone; bumping
                      // up from text-surface-muted fixes the low-contrast
                      // inactive pills in both light and dark modes.
                      "bg-surface-overlay text-dark-100 hover:bg-surface-raised"
              }`}
            >
              {division === "__none__" ? "All" : getDivisionLabel(division)}
              {isMyDiv && !isActive && (
                <span className="ml-1 text-[10px]">(You)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Division Content */}
      {selectedEntry && (
        <div>
          {/* Division Rules */}
          {isRoundRobin && (
            <DivisionRules
              division={selectedEntry.division}
              scoreToWinPool={tournament.score_to_win_pool}
              scoreToWinPlayoff={tournament.score_to_win_playoff}
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
            scoreToWinPool={tournament.score_to_win_pool}
            scoreToWinPlayoff={tournament.score_to_win_playoff}
            finalsBestOf3={tournament.finals_best_of_3}
            partnerMap={partnerMap}
          />
        </div>
      )}
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
