"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface PoolPlayer {
  player_id: string;
  display_name: string;
  court_number: number;
}

export default function ScoreEntryPage() {
  const { id: sessionId } = useParams<{ id: string }>();
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
  const [existingScores, setExistingScores] = useState<any[]>([]);

  useEffect(() => {
    async function fetch() {
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

        // Find current user's court
        const me = mapped.find((m) => m.player_id === profile?.id);
        if (me) setMyCourt(me.court_number);
      }

      // Fetch existing scores for this session
      const { data: scores } = await supabase
        .from("game_results")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      setExistingScores(scores ?? []);
    }
    fetch();
  }, [sessionId, supabase]);

  const courtPlayers = myCourt != null
    ? players.filter((p) => p.court_number === myCourt)
    : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);

    const res = await fetch(`/api/sessions/${sessionId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        round_number: session?.current_round ?? 1,
        pool_number: myCourt,
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
    } else {
      setMessage("Score submitted successfully!");
      setScoreA("");
      setScoreB("");
    }
    setSubmitting(false);
  }

  if (!session) {
    return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Enter Score</h1>
        <p className="text-sm text-surface-muted">
          {session.group?.name} — Round {session.current_round}
          {myCourt && ` — Court ${myCourt}`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Team A */}
          <div>
            <h3 className="text-sm font-semibold text-dark-200 mb-2">Team A</h3>
            <select
              value={teamAP1}
              onChange={(e) => setTeamAP1(e.target.value)}
              className="input mb-2"
              required
            >
              <option value="">Player 1</option>
              {courtPlayers.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <select
              value={teamAP2}
              onChange={(e) => setTeamAP2(e.target.value)}
              className="input"
            >
              <option value="">Player 2 (optional)</option>
              {courtPlayers.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value)}
              className="input mt-2"
              placeholder="Score"
              required
            />
          </div>

          {/* Team B */}
          <div>
            <h3 className="text-sm font-semibold text-dark-200 mb-2">Team B</h3>
            <select
              value={teamBP1}
              onChange={(e) => setTeamBP1(e.target.value)}
              className="input mb-2"
              required
            >
              <option value="">Player 1</option>
              {courtPlayers.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <select
              value={teamBP2}
              onChange={(e) => setTeamBP2(e.target.value)}
              className="input"
            >
              <option value="">Player 2 (optional)</option>
              {courtPlayers.map((p) => (
                <option key={p.player_id} value={p.player_id}>
                  {p.display_name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value)}
              className="input mt-2"
              placeholder="Score"
              required
            />
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.includes("success") ? "text-teal-300" : "text-red-400"}`}>
            {message}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Score"}
        </button>
      </form>

      {/* Existing Scores */}
      {existingScores.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-dark-200 mb-3">Submitted Scores</h2>
          <div className="space-y-2">
            {existingScores.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface-overlay px-4 py-2">
                <span className="text-sm">
                  Court {s.pool_number} — Round {s.round_number}
                </span>
                <span className="font-mono font-semibold">
                  {s.score_a} – {s.score_b}
                </span>
                <span>
                  {s.is_confirmed ? (
                    <span className="badge-green">Confirmed</span>
                  ) : s.is_disputed ? (
                    <span className="badge-red">Disputed</span>
                  ) : (
                    <span className="badge-yellow">Pending</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
