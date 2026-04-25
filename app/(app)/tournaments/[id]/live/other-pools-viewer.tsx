"use client";

import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import { getDivisionLabel } from "@/lib/divisions";
import { getPoolLabel } from "@/lib/tournament-bracket";
import type { TournamentFormat, TournamentMatch } from "@/types/database";
import { useMemo, useState } from "react";

interface Props {
  tournamentId: string;
  /** Every match across every active division (excluding players'
   *  own pool gets handled by this component's filter below). */
  allActiveMatches: TournamentMatch[];
  myDivision: string;
  /** The bracket the viewer is in within their division. Null if
   *  we couldn't identify one (e.g. playoff-only). */
  myBracket: string | null;
  format: TournamentFormat;
  scoreToWinPool?: number;
  scoreToWinPlayoff?: number;
  finalsBestOf3?: boolean;
  /** Per-division setting overrides — used to resolve the right
   *  score-to-win for whichever pool the viewer picks. */
  divisionSettings?: Record<
    string,
    { score_to_win_pool?: number; score_to_win_playoff?: number } | null
  > | null;
  partnerMap?: PartnerMap;
  /** team-primary player_id → playoff seed. Same shape used by the
   *  main TournamentBracketView call so playoff team names show
   *  "(N)" beside their name. */
  seedByPlayerId?: Map<string, number>;
}

/**
 * Player-side read-only browser for pools the viewer isn't in.
 *
 * Lists every (division, bracket) pair across all active divisions
 * except the viewer's own pool in a single dropdown. Picking one
 * renders the standings + match list read-only via the same
 * TournamentBracketView the main Play tab uses — so the visual is
 * identical to how the viewer sees their own pool, just without
 * the score-entry buttons (canManage=false).
 *
 * Modeled on the "view other courts" affordance in the ladder
 * session page — players want to find friends and follow matches
 * they care about without the tournament detail page's noise.
 */
export function OtherPoolsViewer({
  tournamentId,
  allActiveMatches,
  myDivision,
  myBracket,
  format,
  scoreToWinPool,
  scoreToWinPlayoff,
  finalsBestOf3,
  divisionSettings,
  partnerMap,
  seedByPlayerId,
}: Props) {
  // Enumerate every unique (division, bracket) pair in pool play.
  // Playoff brackets are excluded from the selector because each
  // division's playoff is a single elimination tree, not a "pool"
  // in the traditional sense — and they come along for free when
  // a pool option is picked since TournamentBracketView shows
  // pool + playoff for the filtered division.
  const pools = useMemo(() => {
    const byDivision = new Map<string, Set<string>>();
    for (const m of allActiveMatches) {
      if (!m.division || m.bracket === "playoff") continue;
      if (!byDivision.has(m.division)) byDivision.set(m.division, new Set());
      byDivision.get(m.division)!.add(m.bracket);
    }
    const out: { key: string; division: string; bracket: string; label: string }[] = [];
    for (const [division, bracketsSet] of byDivision) {
      const brackets = Array.from(bracketsSet);
      const totalPools = brackets.length;
      for (const bracket of brackets) {
        if (division === myDivision && bracket === myBracket) continue; // skip own pool
        out.push({
          key: `${division}/${bracket}`,
          division,
          bracket,
          label: `${getDivisionLabel(division)} — ${getPoolLabel(bracket, totalPools)}`,
        });
      }
    }
    // Sort by division label then bracket for a tidy dropdown.
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [allActiveMatches, myDivision, myBracket]);

  const [selected, setSelected] = useState<string>("");

  // Matches to render when a pool is selected — scope to that
  // division, include every bracket (standings + playoff, if any)
  // so the view is consistent with how the viewer sees their own
  // pool. The selector filters later, within TournamentBracketView,
  // by picking the matching pool out of the division.
  const selectedMatches = useMemo(() => {
    if (!selected) return [];
    const [div, bracket] = selected.split("/");
    // Grab the selected pool's matches only — keeps the view
    // focused on the one pool the viewer picked, not the whole
    // division (which could also include other pools the viewer
    // likely doesn't want to see right now).
    return allActiveMatches.filter(
      (m) => m.division === div && (m.bracket === bracket || m.bracket === "playoff")
    );
  }, [selected, allActiveMatches]);

  const selectedDivision = selected ? selected.split("/")[0] : "";

  if (pools.length === 0) return null;

  return (
    <div className="space-y-3 card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-dark-100">Other pools</h3>
          <p className="text-xs text-surface-muted mt-0.5">
            Peek at another division or pool — read-only.
          </p>
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="input text-xs py-1.5 px-2 pr-7 max-w-[55%] sm:max-w-none"
          aria-label="Choose a pool to view"
        >
          <option value="">Pick a pool…</option>
          {pools.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {selected && selectedMatches.length > 0 && (() => {
        const override = divisionSettings?.[selectedDivision];
        return (
          <TournamentBracketView
            matches={selectedMatches as any}
            format={format}
            canManage={false}
            tournamentId={tournamentId}
            division={selectedDivision}
            scoreToWinPool={override?.score_to_win_pool ?? scoreToWinPool}
            scoreToWinPlayoff={override?.score_to_win_playoff ?? scoreToWinPlayoff}
            finalsBestOf3={finalsBestOf3}
            partnerMap={partnerMap}
            seedByPlayerId={seedByPlayerId}
          />
        );
      })()}
    </div>
  );
}

