"use client";

import type { TournamentMatch, TournamentFormat } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  matches: TournamentMatch[];
  format: TournamentFormat;
  canManage: boolean;
  tournamentId: string;
}

export function TournamentBracketView({ matches, format, canManage, tournamentId }: Props) {
  if (format === "round_robin") {
    return <RoundRobinView matches={matches} canManage={canManage} tournamentId={tournamentId} />;
  }
  return <EliminationBracketView matches={matches} format={format} canManage={canManage} tournamentId={tournamentId} />;
}

// ============================================================
// Elimination Bracket
// ============================================================

function EliminationBracketView({
  matches,
  format,
  canManage,
  tournamentId,
}: {
  matches: TournamentMatch[];
  format: TournamentFormat;
  canManage: boolean;
  tournamentId: string;
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
                <div key={round} className="flex flex-col gap-4" style={{ minWidth: 220 }}>
                  <p className="text-xs font-medium text-surface-muted text-center">
                    {round === winnersRounds ? "Final" : `Round ${round}`}
                  </p>
                  {roundMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      canManage={canManage}
                      tournamentId={tournamentId}
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
                    <div key={round} className="flex flex-col gap-4" style={{ minWidth: 220 }}>
                      <p className="text-xs font-medium text-surface-muted text-center">
                        LR {round}
                      </p>
                      {roundMatches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          canManage={canManage}
                          tournamentId={tournamentId}
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
          <div style={{ maxWidth: 220 }}>
            <MatchCard
              match={grandFinal}
              canManage={canManage}
              tournamentId={tournamentId}
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
}: {
  matches: TournamentMatch[];
  canManage: boolean;
  tournamentId: string;
}) {
  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort(
    (a, b) => a - b
  );

  // Compute standings
  const standings = new Map<string, { name: string; wins: number; losses: number; pointDiff: number }>();

  for (const m of matches) {
    if (m.player1_id && !standings.has(m.player1_id)) {
      standings.set(m.player1_id, {
        name: (m as any).player1?.display_name ?? m.player1_id.slice(0, 8),
        wins: 0,
        losses: 0,
        pointDiff: 0,
      });
    }
    if (m.player2_id && !standings.has(m.player2_id)) {
      standings.set(m.player2_id, {
        name: (m as any).player2?.display_name ?? m.player2_id.slice(0, 8),
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

  const sortedStandings = Array.from(standings.entries())
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);

  return (
    <div className="space-y-6">
      {/* Standings */}
      {sortedStandings.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-overlay">
              <tr>
                <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted w-8">#</th>
                <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted">Player</th>
                <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">W</th>
                <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">L</th>
                <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">+/-</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-raised">
              {sortedStandings.map((s, i) => (
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
            <h3 className="text-sm font-semibold text-dark-200 mb-2">Round {round}</h3>
            <div className="space-y-2">
              {roundMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  canManage={canManage}
                  tournamentId={tournamentId}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Match Card (shared)
// ============================================================

function MatchCard({
  match,
  canManage,
  tournamentId,
}: {
  match: TournamentMatch;
  canManage: boolean;
  tournamentId: string;
}) {
  const router = useRouter();
  const [scoring, setScoring] = useState(false);
  const [score1Input, setScore1Input] = useState("");
  const [score2Input, setScore2Input] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const p1Name = (match as any).player1?.display_name ?? (match.player1_id ? "TBD" : "—");
  const p2Name = (match as any).player2?.display_name ?? (match.player2_id ? "TBD" : "—");
  const isCompleted = match.status === "completed";
  const isBye = match.status === "bye";
  const canScore = canManage && match.player1_id && match.player2_id && !isCompleted && !isBye;

  const p1Won = isCompleted && match.winner_id === match.player1_id;
  const p2Won = isCompleted && match.winner_id === match.player2_id;

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
        <p className="text-xs text-surface-muted text-center">BYE</p>
      )}

      {!isBye && (
        <>
          {/* Player 1 */}
          <div className="flex items-center justify-between">
            <span className={`text-sm ${p1Won ? "font-semibold text-teal-300" : isCompleted ? "text-surface-muted" : "text-dark-100"}`}>
              {p1Name}
            </span>
            {isCompleted && match.score1.length > 0 && (
              <span className="font-mono text-xs text-dark-200">
                {match.score1.join("-")}
              </span>
            )}
          </div>

          {/* Player 2 */}
          <div className="flex items-center justify-between">
            <span className={`text-sm ${p2Won ? "font-semibold text-teal-300" : isCompleted ? "text-surface-muted" : "text-dark-100"}`}>
              {p2Name}
            </span>
            {isCompleted && match.score2.length > 0 && (
              <span className="font-mono text-xs text-dark-200">
                {match.score2.join("-")}
              </span>
            )}
          </div>

          {/* Score Entry */}
          {canScore && !scoring && (
            <button
              onClick={() => setScoring(true)}
              className="text-xs text-brand-300 font-medium mt-1 hover:text-brand-200"
            >
              Enter score
            </button>
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
