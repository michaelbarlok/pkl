"use client";

import type { TournamentMatch, TournamentFormat } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Map from player_id → partner display name (for doubles)
export type PartnerMap = Map<string, string>;

interface Props {
  matches: TournamentMatch[];
  format: TournamentFormat;
  canManage: boolean;
  tournamentId: string;
  division?: string;
  scoreToWinPool?: number;
  scoreToWinPlayoff?: number;
  finalsBestOf3?: boolean;
  partnerMap?: PartnerMap;
}

export function TournamentBracketView({ matches, format, canManage, tournamentId, division, scoreToWinPool, scoreToWinPlayoff, finalsBestOf3, partnerMap }: Props) {
  if (format === "round_robin") {
    return (
      <RoundRobinView
        matches={matches}
        canManage={canManage}
        tournamentId={tournamentId}
        division={division}
        scoreToWinPool={scoreToWinPool}
        scoreToWinPlayoff={scoreToWinPlayoff}
        finalsBestOf3={finalsBestOf3}
        partnerMap={partnerMap}
      />
    );
  }
  return <EliminationBracketView matches={matches} format={format} canManage={canManage} tournamentId={tournamentId} partnerMap={partnerMap} />;
}

/** Build a team display label: "Player & Partner" for doubles, just "Player" for singles */
function teamLabel(playerId: string | null | undefined, playerName: string, partnerMap?: PartnerMap): string {
  if (!playerId || !partnerMap) return playerName;
  const partnerName = partnerMap.get(playerId);
  if (partnerName) return `${playerName} & ${partnerName}`;
  return playerName;
}

// ============================================================
// Elimination Bracket
// ============================================================

function EliminationBracketView({
  matches,
  format,
  canManage,
  tournamentId,
  partnerMap,
}: {
  matches: TournamentMatch[];
  format: TournamentFormat;
  canManage: boolean;
  tournamentId: string;
  partnerMap?: PartnerMap;
}) {
  const winnersMatches = matches.filter((m) => m.bracket === "winners");
  const losersMatches = matches.filter((m) => m.bracket === "losers");
  const grandFinal = matches.find((m) => m.bracket === "grand_final");

  const winnersRounds = Math.max(...winnersMatches.map((m) => m.round), 0);

  return (
    <div className="space-y-6">
      {/* Winners Bracket */}
      <div>
        <h3 className="text-sm font-semibold text-dark-200 mb-2 uppercase tracking-wider">
          {format === "double_elimination" ? "Winners Bracket" : "Bracket"}
        </h3>
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max pb-4">
            {Array.from({ length: winnersRounds }, (_, i) => i + 1).map((round) => {
              const roundMatches = winnersMatches
                .filter((m) => m.round === round)
                .sort((a, b) => a.match_number - b.match_number);

              return (
                <div key={round} className="flex flex-col gap-4" style={{ minWidth: 260 }}>
                  <p className="text-xs font-medium text-surface-muted text-center">
                    {round === winnersRounds ? "Final" : `Round ${round}`}
                  </p>
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      canManage={canManage}
                      tournamentId={tournamentId}
                      partnerMap={partnerMap}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Losers Bracket */}
      {losersMatches.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-dark-200 mb-2 uppercase tracking-wider">
            Losers Bracket
          </h3>
          <div className="overflow-x-auto">
            <div className="flex gap-6 min-w-max pb-4">
              {Array.from(
                new Set(losersMatches.map((m) => m.round))
              )
                .sort((a, b) => a - b)
                .map((round) => {
                  const roundMatches = losersMatches
                    .filter((m) => m.round === round)
                    .sort((a, b) => a.match_number - b.match_number);

                  return (
                    <div key={round} className="flex flex-col gap-4" style={{ minWidth: 260 }}>
                      <p className="text-xs font-medium text-surface-muted text-center">
                        LR {round}
                      </p>
                      {roundMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          canManage={canManage}
                          tournamentId={tournamentId}
                          partnerMap={partnerMap}
                        />
                      ))}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Grand Final */}
      {grandFinal && (
        <div>
          <h3 className="text-sm font-semibold text-dark-200 mb-2 uppercase tracking-wider">
            Grand Final
          </h3>
          <div style={{ maxWidth: 260 }}>
            <MatchCard
              match={grandFinal}
              canManage={canManage}
              tournamentId={tournamentId}
              partnerMap={partnerMap}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Round Robin
// ============================================================

function RoundRobinView({
  matches,
  canManage,
  tournamentId,
  division,
  scoreToWinPool,
  scoreToWinPlayoff,
  finalsBestOf3,
  partnerMap,
}: {
  matches: TournamentMatch[];
  canManage: boolean;
  tournamentId: string;
  division?: string;
  scoreToWinPool?: number;
  scoreToWinPlayoff?: number;
  finalsBestOf3?: boolean;
  partnerMap?: PartnerMap;
}) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [editableSeeds, setEditableSeeds] = useState<{ id: string; name: string; wins: number; losses: number; pointDiff: number }[]>([]);

  // Separate pool play from playoff matches
  const poolMatches = matches.filter((m) => m.bracket === "winners" || m.bracket === "losers");
  const playoffMatches = matches.filter((m) => m.bracket === "playoff");

  // Check for two-pool setup
  const poolAMatches = poolMatches.filter((m) => m.bracket === "winners");
  const poolBMatches = poolMatches.filter((m) => m.bracket === "losers");
  const hasTwoPools = poolBMatches.length > 0;

  // Check if all pool matches are complete
  const poolComplete = poolMatches.length > 0 && poolMatches.every(
    (m) => m.status === "completed" || m.status === "bye"
  );

  const hasPlayoffs = playoffMatches.length > 0;

  // Determine division results from completed playoff matches
  const divisionResults = getDivisionResults(playoffMatches, partnerMap);

  function handleReviewAdvancement() {
    // Compute the proposed seeding from pool standings
    let proposed: { id: string; name: string; wins: number; losses: number; pointDiff: number }[];

    if (hasTwoPools) {
      const poolAStandings = computeStandings(poolAMatches, partnerMap);
      const poolBStandings = computeStandings(poolBMatches, partnerMap);
      const poolATop3 = poolAStandings.slice(0, 3);
      const poolBTop3 = poolBStandings.slice(0, 3);
      proposed = [...poolATop3, ...poolBTop3].sort(
        (a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff
      );
    } else {
      const standings = computeStandings(poolAMatches, partnerMap);
      proposed = standings.slice(0, 4);
    }

    setEditableSeeds(proposed);
    setShowReview(true);
  }

  function moveSeed(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= editableSeeds.length) return;
    const updated = [...editableSeeds];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setEditableSeeds(updated);
  }

  async function handleConfirmAdvancement() {
    if (!division) return;
    setAdvancing(true);
    setAdvanceError("");
    const res = await fetch(`/api/tournaments/${tournamentId}/divisions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "advance_to_playoffs",
        division,
        seeded_players: editableSeeds.map((s) => s.id),
      }),
    });
    if (res.ok) {
      setShowReview(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setAdvanceError(data?.error ?? "Failed to advance");
    }
    setAdvancing(false);
  }

  return (
    <div className="space-y-6">
      {/* Division Results (visible to everyone when playoffs complete) */}
      {divisionResults && (
        <div className="card border border-brand-300/30 bg-surface-raised">
          <h3 className="text-sm font-semibold text-dark-100 mb-3 uppercase tracking-wider">Results</h3>
          <div className="space-y-2">
            {divisionResults.first && (
              <div className="flex items-center gap-3">
                <span className="text-lg">&#x1F947;</span>
                <span className="text-sm font-semibold text-dark-100">{divisionResults.first}</span>
              </div>
            )}
            {divisionResults.second && (
              <div className="flex items-center gap-3">
                <span className="text-lg">&#x1F948;</span>
                <span className="text-sm font-medium text-dark-200">{divisionResults.second}</span>
              </div>
            )}
            {divisionResults.third && (
              <div className="flex items-center gap-3">
                <span className="text-lg">&#x1F949;</span>
                <span className="text-sm font-medium text-dark-200">{divisionResults.third}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pool Standings + Matches */}
      {hasTwoPools ? (
        <>
          <PoolSection
            label="Pool A"
            matches={poolAMatches}
            canManage={canManage}
            tournamentId={tournamentId}
            scoreToWin={scoreToWinPool}
            partnerMap={partnerMap}
          />
          <PoolSection
            label="Pool B"
            matches={poolBMatches}
            canManage={canManage}
            tournamentId={tournamentId}
            scoreToWin={scoreToWinPool}
            partnerMap={partnerMap}
          />
        </>
      ) : (
        <PoolSection
          label="Pool Play"
          matches={poolAMatches}
          canManage={canManage}
          tournamentId={tournamentId}
          scoreToWin={scoreToWinPool}
          partnerMap={partnerMap}
        />
      )}

      {/* Advance to Playoffs — Review Step */}
      {canManage && poolComplete && !hasPlayoffs && division && !showReview && (
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-200 mb-2">Pool Play Complete</h3>
          <p className="text-xs text-surface-muted mb-3">
            All pool matches are finished.
            {hasTwoPools
              ? " Review the top 3 from each pool before advancing to a 6-team playoff."
              : " Review the top 4 teams before advancing to the playoff bracket."}
          </p>
          <button
            onClick={handleReviewAdvancement}
            className="btn-primary"
          >
            Review Advancement
          </button>
        </div>
      )}

      {/* Seed Review / Confirmation Panel */}
      {showReview && (
        <div className="card border border-brand-300/40">
          <h3 className="text-sm font-semibold text-dark-200 mb-1">Confirm Playoff Seeding</h3>
          <p className="text-xs text-surface-muted mb-3">
            Review and adjust the seeding order. Use the arrows to move teams up or down. Once confirmed, the playoff bracket will be generated.
          </p>
          <div className="space-y-1 mb-4">
            {editableSeeds.map((team, i) => (
              <div key={team.id} className="flex items-center gap-2 rounded-lg bg-surface-overlay px-3 py-2">
                <span className="text-xs font-bold text-brand-300 w-5">#{i + 1}</span>
                <span className="text-sm font-medium text-dark-100 flex-1">{team.name}</span>
                <span className="text-xs text-surface-muted">
                  {team.wins}W-{team.losses}L ({team.pointDiff > 0 ? "+" : ""}{team.pointDiff})
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveSeed(i, -1)}
                    disabled={i === 0}
                    className="text-xs px-1.5 py-0.5 rounded bg-surface-raised text-surface-muted hover:text-dark-200 disabled:opacity-30"
                  >
                    &uarr;
                  </button>
                  <button
                    onClick={() => moveSeed(i, 1)}
                    disabled={i === editableSeeds.length - 1}
                    className="text-xs px-1.5 py-0.5 rounded bg-surface-raised text-surface-muted hover:text-dark-200 disabled:opacity-30"
                  >
                    &darr;
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmAdvancement}
              disabled={advancing}
              className="btn-primary disabled:opacity-50"
            >
              {advancing ? "Generating..." : "Confirm & Generate Playoffs"}
            </button>
            <button
              onClick={() => setShowReview(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
          {advanceError && <p className="text-xs text-red-400 mt-2">{advanceError}</p>}
        </div>
      )}

      {/* Playoff Bracket */}
      {hasPlayoffs && (
        <PlayoffBracketView
          matches={playoffMatches}
          canManage={canManage}
          tournamentId={tournamentId}
          scoreToWin={scoreToWinPlayoff}
          finalsBestOf3={finalsBestOf3}
          partnerMap={partnerMap}
        />
      )}
    </div>
  );
}

/**
 * Shows standings table + matches for a single pool.
 */
function PoolSection({
  label,
  matches,
  canManage,
  tournamentId,
  scoreToWin,
  partnerMap,
}: {
  label: string;
  matches: TournamentMatch[];
  canManage: boolean;
  tournamentId: string;
  scoreToWin?: number;
  partnerMap?: PartnerMap;
}) {
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);

  // Compute standings
  const standings = computeStandings(matches, partnerMap);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">{label}</h3>

      {/* Standings Table */}
      {standings.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-overlay">
              <tr>
                <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted w-8">#</th>
                <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted">Team</th>
                <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">W</th>
                <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">L</th>
                <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">+/-</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-raised">
              {standings.map((s, i) => (
                <tr key={s.id}>
                  <td className="px-2 sm:px-4 py-2 text-sm text-surface-muted">{i + 1}</td>
                  <td className="px-2 sm:px-4 py-2 text-sm font-medium text-dark-100">{s.name}</td>
                  <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold text-teal-300">{s.wins}</td>
                  <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold text-red-400">{s.losses}</td>
                  <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold">
                    <span className={s.pointDiff > 0 ? "text-teal-300" : s.pointDiff < 0 ? "text-red-400" : "text-surface-muted"}>
                      {s.pointDiff > 0 ? "+" : ""}{s.pointDiff}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Matches by Round */}
      {rounds.map((round) => {
        const roundMatches = matches
          .filter((m) => m.round === round)
          .sort((a, b) => a.match_number - b.match_number);

        return (
          <div key={round}>
            <h4 className="text-sm font-semibold text-dark-200 mb-2">Round {round}</h4>
            <div className="space-y-2">
              {roundMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  canManage={canManage}
                  tournamentId={tournamentId}
                  gameInfo={scoreToWin ? `Game to ${scoreToWin}` : undefined}
                  partnerMap={partnerMap}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Playoff bracket view: shows semifinal/quarterfinal rounds,
 * final, and 3rd place game.
 */
function PlayoffBracketView({
  matches,
  canManage,
  tournamentId,
  scoreToWin,
  finalsBestOf3,
  partnerMap,
}: {
  matches: TournamentMatch[];
  canManage: boolean;
  tournamentId: string;
  scoreToWin?: number;
  finalsBestOf3?: boolean;
  partnerMap?: PartnerMap;
}) {
  const maxRound = Math.max(...matches.map((m) => m.round), 0);
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);

  const roundLabels = (round: number): string => {
    if (round === maxRound) return "Finals";
    if (round === maxRound - 1) return "Semifinals";
    return `Round ${round}`;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-dark-200 uppercase tracking-wider">Playoffs</h3>
      <div className="overflow-x-auto">
        <div className="flex gap-6 min-w-max pb-4">
          {rounds.map((round) => {
            const roundMatches = matches
              .filter((m) => m.round === round)
              .sort((a, b) => a.match_number - b.match_number);

            return (
              <div key={round} className="flex flex-col gap-4" style={{ minWidth: 260 }}>
                <p className="text-xs font-medium text-surface-muted text-center">
                  {roundLabels(round)}
                </p>
                {roundMatches.map((match) => {
                  const isThirdPlace = round === maxRound && match.match_number === 2;
                  const isChampionship = round === maxRound && match.match_number === 1;
                  const bestOf3Label = isChampionship && finalsBestOf3 ? " (Best 2 of 3)" : "";
                  const gameInfoText = scoreToWin ? `Game to ${scoreToWin}${bestOf3Label}` : (bestOf3Label ? `Best 2 of 3` : undefined);
                  return (
                    <div key={match.id}>
                      {isThirdPlace && (
                        <p className="text-xs text-surface-muted mb-1 text-center">3rd Place</p>
                      )}
                      {isChampionship && (
                        <p className="text-xs text-surface-muted mb-1 text-center">Championship{bestOf3Label}</p>
                      )}
                      <MatchCard
                        match={match}
                        canManage={canManage}
                        tournamentId={tournamentId}
                        gameInfo={!isChampionship && gameInfoText ? gameInfoText : (scoreToWin ? `Game to ${scoreToWin}` : undefined)}
                        partnerMap={partnerMap}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Determine 1st, 2nd, and 3rd place from completed playoff matches.
 * Returns null if playoffs aren't finished yet.
 */
function getDivisionResults(playoffMatches: TournamentMatch[], partnerMap?: PartnerMap): { first: string; second: string; third: string | null } | null {
  if (playoffMatches.length === 0) return null;

  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const finalRoundMatches = playoffMatches.filter((m) => m.round === maxRound);

  // Championship is match 1 in final round, 3rd place is match 2
  const championship = finalRoundMatches.find((m) => m.match_number === 1);
  const thirdPlace = finalRoundMatches.find((m) => m.match_number === 2);

  if (!championship || championship.status !== "completed" || !championship.winner_id) return null;

  const firstId = championship.winner_id;
  const secondId = championship.player1_id === firstId ? championship.player2_id : championship.player1_id;

  const getName = (id: string | null | undefined, match: TournamentMatch): string => {
    if (!id) return "Unknown";
    let baseName: string | undefined;
    if (id === match.player1_id) baseName = (match as any).player1?.display_name;
    if (!baseName && id === match.player2_id) baseName = (match as any).player2?.display_name;
    if (!baseName) {
      for (const m of playoffMatches) {
        if (m.player1_id === id) { baseName = (m as any).player1?.display_name; break; }
        if (m.player2_id === id) { baseName = (m as any).player2?.display_name; break; }
      }
    }
    if (!baseName) return id.slice(0, 8);
    return teamLabel(id, baseName, partnerMap);
  };

  const first = getName(firstId, championship);
  const second = getName(secondId, championship);

  let third: string | null = null;
  if (thirdPlace && thirdPlace.status === "completed" && thirdPlace.winner_id) {
    third = getName(thirdPlace.winner_id, thirdPlace);
  }

  return { first, second, third };
}

/**
 * Compute standings from a set of matches.
 */
function computeStandings(matches: TournamentMatch[], partnerMap?: PartnerMap) {
  const standings = new Map<string, { name: string; wins: number; losses: number; pointDiff: number }>();

  for (const m of matches) {
    if (m.player1_id && !standings.has(m.player1_id)) {
      const baseName = (m as any).player1?.display_name ?? m.player1_id.slice(0, 8);
      standings.set(m.player1_id, {
        name: teamLabel(m.player1_id, baseName, partnerMap),
        wins: 0,
        losses: 0,
        pointDiff: 0,
      });
    }
    if (m.player2_id && !standings.has(m.player2_id)) {
      const baseName = (m as any).player2?.display_name ?? m.player2_id.slice(0, 8);
      standings.set(m.player2_id, {
        name: teamLabel(m.player2_id, baseName, partnerMap),
        wins: 0,
        losses: 0,
        pointDiff: 0,
      });
    }
    if (m.status === "completed" && m.winner_id) {
      const s1sum = m.score1.reduce((a, b) => a + b, 0);
      const s2sum = m.score2.reduce((a, b) => a + b, 0);

      if (m.player1_id) {
        const s = standings.get(m.player1_id)!;
        if (m.winner_id === m.player1_id) s.wins++;
        else s.losses++;
        s.pointDiff += s1sum - s2sum;
      }
      if (m.player2_id) {
        const s = standings.get(m.player2_id)!;
        if (m.winner_id === m.player2_id) s.wins++;
        else s.losses++;
        s.pointDiff += s2sum - s1sum;
      }
    }
  }

  return Array.from(standings.entries())
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
}

// ============================================================
// Match Card (shared)
// ============================================================

function MatchCard({
  match,
  canManage,
  tournamentId,
  gameInfo,
  partnerMap,
}: {
  match: TournamentMatch;
  canManage: boolean;
  tournamentId: string;
  gameInfo?: string;
  partnerMap?: PartnerMap;
}) {
  const router = useRouter();
  const [scoring, setScoring] = useState(false);
  const [score1Input, setScore1Input] = useState("");
  const [score2Input, setScore2Input] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const p1BaseName = (match as any).player1?.display_name ?? (match.player1_id ? "TBD" : "\u2014");
  const p2BaseName = (match as any).player2?.display_name ?? (match.player2_id ? "TBD" : "\u2014");
  const p1Name = match.player1_id && p1BaseName !== "TBD" ? teamLabel(match.player1_id, p1BaseName, partnerMap) : p1BaseName;
  const p2Name = match.player2_id && p2BaseName !== "TBD" ? teamLabel(match.player2_id, p2BaseName, partnerMap) : p2BaseName;

  const isCompleted = match.status === "completed";
  const isBye = match.status === "bye";
  const canScore = canManage && match.player1_id && match.player2_id && !isBye;
  const canEnterNew = canScore && !isCompleted;
  const canEdit = canScore && isCompleted;

  const p1Won = isCompleted && match.winner_id === match.player1_id;
  const p2Won = isCompleted && match.winner_id === match.player2_id;

  function openEdit() {
    // Pre-fill with existing scores when editing
    if (isCompleted && match.score1.length > 0) {
      setScore1Input(match.score1.join(","));
      setScore2Input(match.score2.join(","));
    }
    setScoring(true);
  }

  async function submitScore() {
    setSaving(true);
    setError("");

    const s1 = score1Input.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    const s2 = score2Input.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));

    if (s1.length === 0 || s2.length === 0) {
      setError("Enter scores (comma-separated for multiple games)");
      setSaving(false);
      return;
    }

    // Determine winner by games won
    let p1Games = 0, p2Games = 0;
    for (let i = 0; i < Math.max(s1.length, s2.length); i++) {
      if ((s1[i] ?? 0) > (s2[i] ?? 0)) p1Games++;
      else p2Games++;
    }
    const winner = p1Games >= p2Games ? match.player1_id : match.player2_id;

    const res = await fetch(`/api/tournaments/${tournamentId}/bracket`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: match.id,
        score1: s1,
        score2: s2,
        winner_id: winner,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }

    setScoring(false);
    router.refresh();
  }

  return (
    <div className={`rounded-lg px-3 py-2 ${isCompleted ? "bg-surface-overlay" : isBye ? "bg-surface-overlay/50" : "bg-surface-raised border border-surface-border"}`}>
      {isBye && (
        <div>
          <span className="text-sm text-dark-100">
            {match.player1_id ? p1Name : p2Name}
          </span>
          <p className="text-xs text-surface-muted mt-0.5">BYE — no opponent this round</p>
        </div>
      )}

      {!isBye && (
        <>
          <div className="flex items-start gap-3">
            {/* Teams + Scores */}
            <div className="flex-1 min-w-0">
              {/* Team 1 */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${p1Won ? "font-semibold text-teal-300" : isCompleted ? "text-surface-muted" : "text-dark-100"}`}>
                  {p1Name}
                </span>
                {isCompleted && match.score1.length > 0 && (
                  <span className="font-mono text-xs text-dark-200 shrink-0">
                    {match.score1.join("-")}
                  </span>
                )}
              </div>

              <div className="text-xs text-surface-muted my-0.5">vs</div>

              {/* Team 2 */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${p2Won ? "font-semibold text-teal-300" : isCompleted ? "text-surface-muted" : "text-dark-100"}`}>
                  {p2Name}
                </span>
                {isCompleted && match.score2.length > 0 && (
                  <span className="font-mono text-xs text-dark-200 shrink-0">
                    {match.score2.join("-")}
                  </span>
                )}
              </div>
            </div>

            {/* Enter Score / Edit Score button — to the right */}
            {canEnterNew && !scoring && (
              <button
                onClick={() => setScoring(true)}
                className="shrink-0 self-center rounded-md bg-brand-300/20 px-3 py-2 text-xs font-semibold text-brand-300 hover:bg-brand-300/30 transition-colors"
              >
                Enter Score
              </button>
            )}

            {canEdit && !scoring && (
              <button
                onClick={openEdit}
                className="shrink-0 self-center rounded-md bg-surface-raised px-3 py-2 text-xs font-medium text-surface-muted hover:text-brand-300 transition-colors"
              >
                Edit
              </button>
            )}
          </div>

          {/* Game Info */}
          {gameInfo && !isCompleted && match.player1_id && match.player2_id && (
            <p className="text-xs text-surface-muted mt-1">{gameInfo}</p>
          )}

          {scoring && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={score1Input}
                  onChange={(e) => setScore1Input(e.target.value)}
                  className="input w-20 py-1 text-center text-xs"
                  placeholder="11,9,11"
                  autoFocus
                />
                <span className="text-xs text-surface-muted">vs</span>
                <input
                  type="text"
                  value={score2Input}
                  onChange={(e) => setScore2Input(e.target.value)}
                  className="input w-20 py-1 text-center text-xs"
                  placeholder="7,11,5"
                />
              </div>
              <div className="flex gap-1">
                <button onClick={submitScore} disabled={saving} className="text-xs text-teal-300 font-medium">
                  {saving ? "..." : "Save"}
                </button>
                <button onClick={() => setScoring(false)} className="text-xs text-surface-muted ml-1">
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
