"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FormError } from "@/components/form-error";

interface MatchRow {
  id: string;
  round_number: number;
  team_a_p1: string;
  team_a_p2: string;
  team_b_p1: string;
  team_b_p2: string;
  score_a: number;
  score_b: number;
}

interface SessionPlayer {
  id: string;
  displayName: string;
}

interface Props {
  groupId: string;
  sessionId: string;
  initialMatches: MatchRow[];
  sessionPlayers: SessionPlayer[];
  isAdmin: boolean;
}

export function SessionRecapAdmin({
  groupId,
  sessionId,
  initialMatches,
  sessionPlayers,
  isAdmin,
}: Props) {
  const [matches, setMatches] = useState<MatchRow[]>(initialMatches);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    scoreA: "", scoreB: "",
    teamAP1: "", teamAP2: "", teamBP1: "", teamBP2: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const playerMap = new Map(sessionPlayers.map((p) => [p.id, p.displayName]));
  const getName = (id: string) => playerMap.get(id) ?? "Unknown";

  function enterEdit(m: MatchRow) {
    setEditingMatchId(m.id);
    setDraft({
      scoreA: String(m.score_a),
      scoreB: String(m.score_b),
      teamAP1: m.team_a_p1,
      teamAP2: m.team_a_p2,
      teamBP1: m.team_b_p1,
      teamBP2: m.team_b_p2,
    });
    setError("");
  }

  function cancelEdit() {
    setEditingMatchId(null);
    setError("");
  }

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions/${sessionId}/matches`);
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches ?? []);
      }
    } catch {}
  }, [groupId, sessionId]);

  async function saveEdit(matchId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        `/api/groups/${groupId}/sessions/${sessionId}/matches/${matchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scoreA: parseInt(draft.scoreA, 10),
            scoreB: parseInt(draft.scoreB, 10),
            teamAP1: draft.teamAP1,
            teamAP2: draft.teamAP2,
            teamBP1: draft.teamBP1,
            teamBP2: draft.teamBP2,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        setSaving(false);
        return;
      }
      setEditingMatchId(null);
      await refetch();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const byRound: Record<number, MatchRow[]> = {};
  for (const m of matches) {
    (byRound[m.round_number] ??= []).push(m);
  }
  const roundNums = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">
        All Matches
      </h2>
      {roundNums.map((rn) => (
        <div key={rn}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-surface-muted">
            Round {rn}
          </p>
          <div className="space-y-2">
            {byRound[rn].map((m) => {
              const isEditing = editingMatchId === m.id;
              return (
                <div key={m.id} className="card space-y-3">
                  {isEditing ? (
                    <>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                        {/* Team A */}
                        <div className="space-y-1">
                          <select
                            value={draft.teamAP1}
                            onChange={(e) => setDraft((p) => ({ ...p, teamAP1: e.target.value }))}
                            className="input text-sm w-full"
                          >
                            {sessionPlayers.map((p) => (
                              <option key={p.id} value={p.id}>{p.displayName}</option>
                            ))}
                          </select>
                          <select
                            value={draft.teamAP2}
                            onChange={(e) => setDraft((p) => ({ ...p, teamAP2: e.target.value }))}
                            className="input text-sm w-full"
                          >
                            {sessionPlayers.map((p) => (
                              <option key={p.id} value={p.id}>{p.displayName}</option>
                            ))}
                          </select>
                        </div>
                        {/* Scores */}
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft.scoreA}
                            onChange={(e) => setDraft((p) => ({ ...p, scoreA: e.target.value }))}
                            className="input w-16 py-2 text-center text-xl font-bold"
                          />
                          <span className="text-surface-muted font-bold">:</span>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft.scoreB}
                            onChange={(e) => setDraft((p) => ({ ...p, scoreB: e.target.value }))}
                            className="input w-16 py-2 text-center text-xl font-bold"
                          />
                        </div>
                        {/* Team B */}
                        <div className="space-y-1">
                          <select
                            value={draft.teamBP1}
                            onChange={(e) => setDraft((p) => ({ ...p, teamBP1: e.target.value }))}
                            className="input text-sm w-full"
                          >
                            {sessionPlayers.map((p) => (
                              <option key={p.id} value={p.id}>{p.displayName}</option>
                            ))}
                          </select>
                          <select
                            value={draft.teamBP2}
                            onChange={(e) => setDraft((p) => ({ ...p, teamBP2: e.target.value }))}
                            className="input text-sm w-full"
                          >
                            {sessionPlayers.map((p) => (
                              <option key={p.id} value={p.id}>{p.displayName}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <FormError message={error} />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(m.id)}
                          disabled={saving}
                          className="btn-primary flex-1 text-sm py-1.5"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="btn-secondary flex-1 text-sm py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="text-right space-y-0.5">
                        <p className="text-sm font-medium text-dark-100">{getName(m.team_a_p1)}</p>
                        <p className="text-sm text-surface-muted">{getName(m.team_a_p2)}</p>
                      </div>
                      <div className="flex items-center gap-1 text-lg font-bold">
                        <span className={cn(m.score_a > m.score_b ? "text-teal-300" : "text-dark-100")}>
                          {m.score_a}
                        </span>
                        <span className="text-surface-muted text-sm">:</span>
                        <span className={cn(m.score_b > m.score_a ? "text-teal-300" : "text-dark-100")}>
                          {m.score_b}
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => enterEdit(m)}
                            className="ml-2 text-xs text-brand-400 hover:text-brand-300 font-normal"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-dark-100">{getName(m.team_b_p1)}</p>
                        <p className="text-sm text-surface-muted">{getName(m.team_b_p2)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
