"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import type { ShootoutSession, SessionParticipant, GameResult } from "@/types/database";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  checking_in: "Check-In Open",
  seeding: "Seeding Courts",
  round_active: "Round In Progress",
  round_complete: "Round Complete",
  session_complete: "Session Complete",
};

const STATUS_COLORS: Record<string, string> = {
  created: "bg-surface-overlay text-dark-200",
  checking_in: "bg-accent-900/40 text-accent-300",
  seeding: "bg-brand-900/40 text-brand-300",
  round_active: "bg-teal-900/30 text-teal-300",
  round_complete: "bg-brand-900/40 text-brand-300",
  session_complete: "bg-surface-overlay text-dark-200",
};

// ============================================================
// Standings Calculation
// ============================================================

interface Standing {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  pointDiff: number;
}

function computeStandings(
  courtPlayers: { player_id: string; player?: { display_name: string } }[],
  courtScores: GameResult[]
): Standing[] {
  const standings = new Map<string, Standing>();

  for (const p of courtPlayers) {
    standings.set(p.player_id, {
      playerId: p.player_id,
      displayName: p.player?.display_name ?? "Unknown",
      wins: 0,
      losses: 0,
      pointDiff: 0,
    });
  }

  for (const game of courtScores) {
    const teamAIds = [game.team_a_p1, game.team_a_p2].filter(Boolean);
    const teamBIds = [game.team_b_p1, game.team_b_p2].filter(Boolean);
    const aWon = game.score_a > game.score_b;

    for (const pid of teamAIds) {
      const s = standings.get(pid!);
      if (!s) continue;
      if (aWon) s.wins++;
      else s.losses++;
      s.pointDiff += game.score_a - game.score_b;
    }

    for (const pid of teamBIds) {
      const s = standings.get(pid!);
      if (!s) continue;
      if (!aWon) s.wins++;
      else s.losses++;
      s.pointDiff += game.score_b - game.score_a;
    }
  }

  // Sort: wins DESC, then point differential DESC
  return Array.from(standings.values()).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return b.pointDiff - a.pointDiff;
  });
}

// ============================================================
// Match Schedule Generation
// ============================================================

interface ScheduledMatch {
  gameNumber: number;
  team1: string[];
  team2: string[];
  bye?: string;
  result?: { scoreA: number; scoreB: number };
}

function generateMatchSchedule(
  playerIds: string[],
  playerNames: Map<string, string>,
  scores: GameResult[]
): ScheduledMatch[] {
  const n = playerIds.length;
  if (n < 4) return [];

  const matches: ScheduledMatch[] = [];

  if (n === 4) {
    // Standard 4-player doubles round robin: 3 games
    const [a, b, c, d] = playerIds;
    matches.push(
      { gameNumber: 1, team1: [a, b], team2: [c, d] },
      { gameNumber: 2, team1: [a, c], team2: [b, d] },
      { gameNumber: 3, team1: [a, d], team2: [b, c] }
    );
  } else if (n === 5) {
    // 5-player round robin: 5 games, each player sits out once
    const [a, b, c, d, e] = playerIds;
    matches.push(
      { gameNumber: 1, team1: [a, b], team2: [c, d], bye: e },
      { gameNumber: 2, team1: [a, c], team2: [b, e], bye: d },
      { gameNumber: 3, team1: [b, d], team2: [a, e], bye: c },
      { gameNumber: 4, team1: [c, e], team2: [a, d], bye: b },
      { gameNumber: 5, team1: [d, e], team2: [b, c], bye: a }
    );
  }

  // Match submitted scores to scheduled matches
  for (const match of matches) {
    const team1Set = new Set(match.team1);
    const team2Set = new Set(match.team2);

    const found = scores.find((s) => {
      const sTeamA = new Set([s.team_a_p1, s.team_a_p2].filter((v): v is string => !!v));
      const sTeamB = new Set([s.team_b_p1, s.team_b_p2].filter((v): v is string => !!v));

      // Check both orientations
      const match1 =
        setsEqual(sTeamA, team1Set) && setsEqual(sTeamB, team2Set);
      const match2 =
        setsEqual(sTeamA, team2Set) && setsEqual(sTeamB, team1Set);

      return match1 || match2;
    });

    if (found) {
      const sTeamA = new Set([found.team_a_p1, found.team_a_p2].filter((v): v is string => !!v));
      const isTeam1AsA = setsEqual(sTeamA, team1Set);
      match.result = {
        scoreA: isTeam1AsA ? found.score_a : found.score_b,
        scoreB: isTeam1AsA ? found.score_b : found.score_a,
      };
    }
  }

  return matches;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function formatTeam(ids: string[], names: Map<string, string>): string {
  return ids.map((id) => names.get(id) ?? "?").join(" & ");
}

// ============================================================
// Component
// ============================================================

export default function PlayerSessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const [session, setSession] = useState<(ShootoutSession & { group: { name: string }; sheet: { event_date: string; location: string } }) | null>(null);
  const [participants, setParticipants] = useState<(SessionParticipant & { player: { display_name: string; avatar_url: string | null } })[]>([]);
  const [scores, setScores] = useState<GameResult[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [myCourt, setMyCourt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Refetch all data — called on mount and when returning to this page
  async function refetchAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profile) setMyPlayerId(profile.id);

    const { data: sess } = await supabase
      .from("shootout_sessions")
      .select("*, group:shootout_groups(name), sheet:signup_sheets(event_date, location)")
      .eq("id", sessionId)
      .single();
    setSession(sess as any);

    const { data: parts } = await supabase
      .from("session_participants")
      .select("*, player:profiles(display_name, avatar_url)")
      .eq("session_id", sessionId)
      .order("court_number", { ascending: true });

    if (parts) {
      setParticipants(parts as any);
      const me = parts.find((p: any) => p.player_id === profile?.id);
      if (me) setMyCourt((me as any).court_number);
    }

    const { data: gameScores } = await supabase
      .from("game_results")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at");
    setScores(gameScores ?? []);

    setLoading(false);
  }

  useEffect(() => {
    refetchAll();
  }, [sessionId, supabase]);

  // Refetch when returning to this page (back navigation, tab switch)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refetchAll();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refetchAll);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refetchAll);
    };
  }, [sessionId, supabase]);

  // Realtime subscriptions
  useEffect(() => {
    const sessionChannel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shootout_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          setSession((prev) => prev ? { ...prev, ...payload.new } : prev);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` },
        () => {
          supabase
            .from("session_participants")
            .select("*, player:profiles(display_name, avatar_url)")
            .eq("session_id", sessionId)
            .order("court_number", { ascending: true })
            .then(({ data }) => {
              if (data) {
                setParticipants(data as any);
                const me = data.find((p: any) => p.player_id === myPlayerId);
                if (me) setMyCourt((me as any).court_number);
              }
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_results", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setScores((prev) => [...prev, payload.new as GameResult]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_results", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setScores((prev) =>
            prev.map((s) => (s.id === (payload.new as GameResult).id ? (payload.new as GameResult) : s))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
    };
  }, [sessionId, supabase, myPlayerId]);

  // Derived data
  const myCourtPlayers = useMemo(
    () => participants.filter((p) => p.court_number === myCourt),
    [participants, myCourt]
  );

  const myCourtScores = useMemo(
    () => scores.filter((s) => s.pool_number === myCourt),
    [scores, myCourt]
  );

  const standings = useMemo(
    () => computeStandings(myCourtPlayers as any, myCourtScores),
    [myCourtPlayers, myCourtScores]
  );

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      map.set(p.player_id, p.player?.display_name ?? "Unknown");
    }
    return map;
  }, [participants]);

  const matchSchedule = useMemo(
    () =>
      myCourt != null
        ? generateMatchSchedule(
            myCourtPlayers.map((p) => p.player_id),
            playerNames,
            myCourtScores
          )
        : [],
    [myCourtPlayers, playerNames, myCourtScores, myCourt]
  );

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading session...</div>;
  if (!session) return <div className="text-center py-12 text-surface-muted">Session not found.</div>;

  const isActive = session.status === "round_active" || session.status === "round_complete";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-100">{session.group?.name}</h1>
        <p className="text-sm text-surface-muted">
          {session.sheet?.event_date &&
            new Date(session.sheet.event_date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          {session.sheet?.location && ` — ${session.sheet.location}`}
        </p>
      </div>

      {/* Status + Round */}
      <div className="flex items-center gap-4">
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[session.status] ?? "bg-surface-overlay text-dark-200"}`}>
          {STATUS_LABELS[session.status] ?? session.status}
        </span>
        {session.num_courts > 0 && (
          <span className="text-sm text-surface-muted">{session.num_courts} courts</span>
        )}
      </div>

      {/* My Court Assignment */}
      {myCourt != null && (
        <div className="card bg-brand-900/40 border border-brand-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-300">Your Court</p>
              <p className="text-3xl font-bold text-brand-200">Court {myCourt}</p>
            </div>
          </div>
        </div>
      )}

      {/* Live Standings Table */}
      {isActive && myCourt != null && standings.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-3">Standings — Court {myCourt}</h2>
          <div className="card overflow-hidden p-0">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted w-10">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted">Player</th>
                  <th className="px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">W</th>
                  <th className="px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">L</th>
                  <th className="px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {standings.map((s, i) => (
                  <tr
                    key={s.playerId}
                    className={s.playerId === myPlayerId ? "bg-brand-900/40" : ""}
                  >
                    <td className="px-4 py-2 text-sm font-medium text-surface-muted">{i + 1}</td>
                    <td className="px-4 py-2 text-sm font-medium text-dark-100">
                      {s.displayName}
                      {s.playerId === myPlayerId && (
                        <span className="ml-1 text-xs text-brand-600">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-sm font-semibold text-teal-300">{s.wins}</td>
                    <td className="px-4 py-2 text-center text-sm font-semibold text-red-400">{s.losses}</td>
                    <td className="px-4 py-2 text-center text-sm font-semibold">
                      <span className={s.pointDiff > 0 ? "text-teal-300" : s.pointDiff < 0 ? "text-red-400" : "text-surface-muted"}>
                        {s.pointDiff > 0 ? "+" : ""}{s.pointDiff}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Match Schedule */}
      {isActive && myCourt != null && matchSchedule.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-3">Match Schedule</h2>
          <div className="space-y-2">
            {matchSchedule.map((match) => {
              const hasResult = !!match.result;
              const team1Won = hasResult && match.result!.scoreA > match.result!.scoreB;
              const team2Won = hasResult && match.result!.scoreB > match.result!.scoreA;

              if (hasResult) {
                return (
                  <div
                    key={match.gameNumber}
                    className="rounded-lg px-4 py-3 bg-surface-overlay"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-surface-muted w-8 shrink-0">G{match.gameNumber}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${team1Won ? "text-teal-300" : "text-red-400"}`}>
                        {formatTeam(match.team1, playerNames)}
                      </span>
                      <span className={`font-mono text-sm font-bold ${team1Won ? "text-teal-300" : "text-red-400"}`}>
                        {match.result!.scoreA}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${team2Won ? "text-teal-300" : "text-red-400"}`}>
                        {formatTeam(match.team2, playerNames)}
                      </span>
                      <span className={`font-mono text-sm font-bold ${team2Won ? "text-teal-300" : "text-red-400"}`}>
                        {match.result!.scoreB}
                      </span>
                    </div>
                    {match.bye && (
                      <p className="text-[11px] text-accent-300/80 mt-1">
                        Bye: {playerNames.get(match.bye) ?? "?"}
                      </p>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={match.gameNumber}
                  href={`/sessions/${sessionId}/score?game=${match.gameNumber}`}
                  className="block rounded-lg px-4 py-3 bg-surface-raised border border-surface-border hover:border-brand-500/50 hover:bg-brand-900/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-surface-muted w-8 shrink-0">
                        G{match.gameNumber}
                      </span>
                      <span className="text-sm text-dark-100">
                        {formatTeam(match.team1, playerNames)}
                      </span>
                      <span className="text-xs text-surface-muted">vs</span>
                      <span className="text-sm text-dark-100">
                        {formatTeam(match.team2, playerNames)}
                      </span>
                    </div>
                    <span className="text-xs text-brand-300 font-medium">Enter score &rarr;</span>
                  </div>
                  {match.bye && (
                    <p className="text-[11px] text-accent-300/80 mt-0.5 ml-8">
                      Bye: {playerNames.get(match.bye) ?? "?"}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Session status messages */}
      {session.status === "created" && (
        <div className="card text-center text-surface-muted">
          <p>This session hasn&apos;t started yet. Check-in will open soon.</p>
        </div>
      )}
      {session.status === "checking_in" && !myCourt && (
        <div className="card text-center text-surface-muted">
          <p>Check-in is open. Please check in with the session organizer.</p>
        </div>
      )}
      {session.status === "seeding" && (
        <div className="card text-center text-surface-muted">
          <p>Courts are being assigned. Your court number will appear here shortly.</p>
        </div>
      )}
      {session.status === "session_complete" && (
        <div className="card text-center">
          <p className="text-dark-200 font-medium">Session complete!</p>
          {participants.find((p) => p.player_id === myPlayerId) && (() => {
            const me = participants.find((p) => p.player_id === myPlayerId);
            if (!me || me.step_after == null) return null;
            const diff = me.step_before - me.step_after;
            return (
              <p className="mt-2 text-sm text-surface-muted">
                Your step: {me.step_before} → {me.step_after}
                {diff > 0 && <span className="text-teal-300 font-medium"> (moved up {diff})</span>}
                {diff < 0 && <span className="text-red-400 font-medium"> (moved down {Math.abs(diff)})</span>}
                {diff === 0 && <span className="text-surface-muted"> (no change)</span>}
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
