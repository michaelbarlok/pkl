"use client";

import { FirstChoiceBadge } from "@/components/first-choice-badge";
import { useSupabase } from "@/components/providers/supabase-provider";
import { matchFirstChoice } from "@/lib/first-choice";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

interface PoolPlayer {
  player_id: string;
  display_name: string;
  court_number: number;
}

interface ScheduledMatch {
  gameNumber: number;
  team1: string[];
  team2: string[];
}

function generateSchedule(playerIds: string[]): ScheduledMatch[] {
  // Sort player IDs for deterministic schedule regardless of query order
  playerIds = [...playerIds].sort();
  const n = playerIds.length;
  if (n < 4) return [];

  if (n === 4) {
    const [a, b, c, d] = playerIds;
    return [
      { gameNumber: 1, team1: [a, b], team2: [c, d] },
      { gameNumber: 2, team1: [a, c], team2: [b, d] },
      { gameNumber: 3, team1: [a, d], team2: [b, c] },
    ];
  }

  if (n === 5) {
    const [a, b, c, d, e] = playerIds;
    return [
      { gameNumber: 1, team1: [a, b], team2: [c, d] },
      { gameNumber: 2, team1: [a, c], team2: [b, e] },
      { gameNumber: 3, team1: [b, d], team2: [a, e] },
      { gameNumber: 4, team1: [c, e], team2: [a, d] },
      { gameNumber: 5, team1: [d, e], team2: [b, c] },
    ];
  }

  return [];
}

export default function ScoreEntryPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const gameParam = searchParams.get("game");
  // Admins can pass ?court=N to enter scores on any court
  const courtParam = searchParams.get("court");
  const { supabase } = useSupabase();
  const [session, setSession] = useState<any>(null);
  const [players, setPlayers] = useState<PoolPlayer[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [myCourt, setMyCourt] = useState<number | null>(null);
  const [teamAP1, setTeamAP1] = useState("");
  const [teamAP2, setTeamAP2] = useState("");
  const [teamBP1, setTeamBP1] = useState("");
  const [teamBP2, setTeamBP2] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchData() {
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
        .select("*, group:shootout_groups(name)")
        .eq("id", sessionId)
        .single();
      setSession(sess);

      const { data: parts } = await supabase
        .from("session_participants")
        .select("player_id, court_number, player:profiles(id, display_name)")
        .eq("session_id", sessionId)
        .eq("checked_in", true)
        .order("court_number");

      if (parts) {
        const mapped = parts.map((p: any) => ({
          player_id: p.player_id,
          display_name: p.player?.display_name ?? "Unknown",
          court_number: p.court_number,
        }));
        setPlayers(mapped);

        const me = mapped.find((m) => m.player_id === profile?.id);
        if (me) setMyCourt(me.court_number);
      }
    }
    fetchData();
  }, [sessionId, supabase]);

  // Use courtParam when supplied (admin entering for a different court)
  const activeCourt = courtParam != null ? parseInt(courtParam) : myCourt;

  const courtPlayers = activeCourt != null
    ? players.filter((p) => p.court_number === activeCourt)
    : [];

  // Auto-populate teams from game param
  const prefilledMatch = useMemo(() => {
    if (!gameParam || courtPlayers.length < 4) return null;
    const schedule = generateSchedule(courtPlayers.map((p) => p.player_id));
    return schedule.find((m) => m.gameNumber === parseInt(gameParam)) ?? null;
  }, [gameParam, courtPlayers]);

  // Set team values when prefilled match is available
  useEffect(() => {
    if (prefilledMatch) {
      setTeamAP1(prefilledMatch.team1[0]);
      setTeamAP2(prefilledMatch.team1[1] ?? "");
      setTeamBP1(prefilledMatch.team2[0]);
      setTeamBP2(prefilledMatch.team2[1] ?? "");
    }
  }, [prefilledMatch]);

  const playerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of courtPlayers) {
      map.set(p.player_id, p.display_name);
    }
    return map;
  }, [courtPlayers]);

  function formatTeamNames(ids: string[]): string {
    return ids.map((id) => playerNameMap.get(id) ?? "?").join(" & ");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);

    const res = await fetch(`/api/sessions/${sessionId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        round_number: session?.current_round || 1,
        pool_number: activeCourt,
        team_a_p1: teamAP1,
        team_a_p2: teamAP2 || null,
        team_b_p1: teamBP1,
        team_b_p2: teamBP2 || null,
        score_a: parseInt(scoreA),
        score_b: parseInt(scoreB),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Failed to submit score");
      setSubmitting(false);
    } else {
      // Full page navigation to guarantee fresh data fetch
      window.location.href = `/sessions/${sessionId}`;
    }
  }

  if (!session) {
    return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Enter Score</h1>
        <p className="text-sm text-surface-muted">
          {session.group?.name} — Round {session.current_round || 1}
          {activeCourt != null && ` — Court ${activeCourt}`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {prefilledMatch ? (
          <>
            {/* Game header — tags whichever team has "first choice" so the
                scorekeeper can confirm it before play. */}
            {(() => {
              const firstChoice = activeCourt != null
                ? matchFirstChoice(sessionId, activeCourt, prefilledMatch.gameNumber)
                : null;
              return (
                <div className="card bg-surface-overlay text-center py-3">
                  <p className="text-xs font-semibold text-surface-muted uppercase tracking-wider mb-1">
                    Game {prefilledMatch.gameNumber}
                  </p>
                  <p className="text-base font-semibold text-dark-100 flex items-center justify-center gap-2 flex-wrap">
                    <span>{formatTeamNames(prefilledMatch.team1)}</span>
                    {firstChoice === "team1" && <FirstChoiceBadge />}
                  </p>
                  <p className="text-xs text-surface-muted my-0.5">vs</p>
                  <p className="text-base font-semibold text-dark-100 flex items-center justify-center gap-2 flex-wrap">
                    <span>{formatTeamNames(prefilledMatch.team2)}</span>
                    {firstChoice === "team2" && <FirstChoiceBadge />}
                  </p>
                </div>
              );
            })()}

            {/* Score inputs */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <label className="block text-xs font-semibold text-surface-muted mb-2 text-center uppercase tracking-wider truncate">
                  {formatTeamNames(prefilledMatch.team1)}
                </label>
                <input
                  type="number"
                  min={0}
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  className="input text-center text-3xl font-bold py-5 sm:text-xl sm:py-2 w-full"
                  placeholder="0"
                  required
                  autoFocus
                />
              </div>
              <span className="text-lg font-bold text-surface-muted mt-6">—</span>
              <div>
                <label className="block text-xs font-semibold text-surface-muted mb-2 text-center uppercase tracking-wider truncate">
                  {formatTeamNames(prefilledMatch.team2)}
                </label>
                <input
                  type="number"
                  min={0}
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  className="input text-center text-3xl font-bold py-5 sm:text-xl sm:py-2 w-full"
                  placeholder="0"
                  required
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-center text-surface-muted">Unable to determine matchup. Please go back and select a game.</p>
        )}

        {message && (
          <p className={`text-sm ${message.includes("success") ? "text-teal-300" : "text-red-400"}`}>
            {message}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Score"}
        </button>
      </form>
    </div>
  );
}
