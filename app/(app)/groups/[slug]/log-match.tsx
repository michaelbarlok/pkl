"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  player_id: string;
  player: {
    id: string;
    display_name: string;
  };
}

export function LogMatchForm({
  groupId,
  members,
}: {
  groupId: string;
  members: Member[];
}) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [isDoubles, setIsDoubles] = useState(false);
  const [teamAp1, setTeamAp1] = useState("");
  const [teamAp2, setTeamAp2] = useState("");
  const [teamBp1, setTeamBp1] = useState("");
  const [teamBp2, setTeamBp2] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!teamAp1 || !teamBp1) {
      setError("Please select players for both teams.");
      return;
    }
    if (isDoubles && (!teamAp2 || !teamBp2)) {
      setError("Please select all 4 players for doubles.");
      return;
    }

    const selectedIds = [teamAp1, teamBp1, ...(isDoubles ? [teamAp2, teamBp2] : [])];
    if (new Set(selectedIds).size !== selectedIds.length) {
      setError("Each player can only appear once.");
      return;
    }

    setSubmitting(true);

    const res = await fetch(`/api/groups/${groupId}/free-play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_a_p1: teamAp1,
        team_a_p2: isDoubles ? teamAp2 : null,
        team_b_p1: teamBp1,
        team_b_p2: isDoubles ? teamBp2 : null,
        score_a: parseInt(scoreA, 10),
        score_b: parseInt(scoreB, 10),
        notes: notes.trim() || null,
      }),
    });

    if (res.ok) {
      setSuccess("Match logged!");
      setTeamAp1("");
      setTeamAp2("");
      setTeamBp1("");
      setTeamBp2("");
      setScoreA("");
      setScoreB("");
      setNotes("");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to log match.");
    }

    setSubmitting(false);
  }

  const playerOptions = members.map((m) => (
    <option key={m.player_id} value={m.player_id}>
      {m.player.display_name}
    </option>
  ));

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-100">Log a Match</h3>
        <label className="flex items-center gap-2 text-sm text-dark-200">
          <input
            type="checkbox"
            checked={isDoubles}
            onChange={(e) => setIsDoubles(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
          />
          Doubles
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Team A */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-dark-200">Team A</p>
          <select value={teamAp1} onChange={(e) => setTeamAp1(e.target.value)} className="input w-full">
            <option value="">Select player...</option>
            {playerOptions}
          </select>
          {isDoubles && (
            <select value={teamAp2} onChange={(e) => setTeamAp2(e.target.value)} className="input w-full">
              <option value="">Select partner...</option>
              {playerOptions}
            </select>
          )}
          <input
            type="number"
            min={0}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            placeholder="Score"
            required
            className="input w-full"
          />
        </div>

        {/* Team B */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-dark-200">Team B</p>
          <select value={teamBp1} onChange={(e) => setTeamBp1(e.target.value)} className="input w-full">
            <option value="">Select player...</option>
            {playerOptions}
          </select>
          {isDoubles && (
            <select value={teamBp2} onChange={(e) => setTeamBp2(e.target.value)} className="input w-full">
              <option value="">Select partner...</option>
              {playerOptions}
            </select>
          )}
          <input
            type="number"
            min={0}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            placeholder="Score"
            required
            className="input w-full"
          />
        </div>
      </div>

      <div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="input w-full"
        />
      </div>

      <FormError message={error} />
      {success && <p className="text-sm text-teal-300">{success}</p>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Logging..." : "Log Match"}
      </button>
    </form>
  );
}
