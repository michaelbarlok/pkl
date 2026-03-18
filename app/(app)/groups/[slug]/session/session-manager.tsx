"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PlayerStanding {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  pointDiff: number;
}

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface Member {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface RoundMatch {
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
}

interface CurrentRound {
  roundNumber: number;
  matches: RoundMatch[];
  sitting: string[];
  partnerHistory: Record<string, number>;
  previousSitting: string[];
}

interface SessionData {
  id: string;
  status: string;
  roundNumber: number;
  currentRound: CurrentRound | null;
  createdAt: string;
}

interface Props {
  group: { id: string; name: string; slug: string };
  members: Member[];
  activeSession: SessionData | null;
  checkedInPlayerIds: string[];
  currentPlayerId: string;
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export function SessionManager({
  group,
  members,
  activeSession,
  checkedInPlayerIds,
  currentPlayerId,
}: Props) {
  const router = useRouter();

  if (!activeSession) {
    return (
      <CheckInPhase
        group={group}
        members={members}
        onSessionCreated={() => router.refresh()}
      />
    );
  }

  return (
    <ActivePhase
      key={activeSession.currentRound?.roundNumber ?? activeSession.id}
      group={group}
      members={members}
      session={activeSession}
      checkedInPlayerIds={checkedInPlayerIds}
      currentPlayerId={currentPlayerId}
      onUpdate={() => router.refresh()}
    />
  );
}

// ------------------------------------------------------------------
// Check-in Phase
// ------------------------------------------------------------------

function CheckInPhase({
  group,
  members,
  onSessionCreated,
}: {
  group: { id: string; name: string; slug: string };
  members: Member[];
  onSessionCreated: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(members.map((m) => m.id)));
  }

  async function startSession() {
    if (selected.size < 4) {
      setError("You need at least 4 players to start a session.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/groups/${group.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: Array.from(selected) }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to start session");
        setLoading(false);
        return;
      }

      onSessionCreated();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/groups/${group.slug}`}
          className="text-sm text-surface-muted hover:text-dark-200"
        >
          &larr; Back to {group.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-dark-100">Start Session</h1>
        <p className="mt-1 text-surface-muted">
          Check in the players who are here today. At least 4 are needed for
          doubles.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-dark-200">
            Players ({selected.size} checked in)
          </h2>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            Select all
          </button>
        </div>

        <div className="space-y-1">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                selected.has(m.id)
                  ? "bg-brand-900/40 ring-1 ring-brand-500/30"
                  : "hover:bg-surface-overlay"
              )}
            >
              <div
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  selected.has(m.id)
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-surface-border bg-surface-overlay"
                )}
              >
                {selected.has(m.id) && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    className="h-3 w-3"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                )}
              </div>
              {m.avatarUrl ? (
                <img
                  src={m.avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                  {m.displayName.charAt(0)}
                </div>
              )}
              <span className="text-sm font-medium text-dark-100">
                {m.displayName}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={startSession}
        disabled={loading || selected.size < 4}
        className="btn-primary w-full"
      >
        {loading
          ? "Starting..."
          : `Start Session (${selected.size} player${selected.size !== 1 ? "s" : ""})`}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Active Phase
// ------------------------------------------------------------------

function ActivePhase({
  group,
  members,
  session,
  checkedInPlayerIds,
  currentPlayerId,
  onUpdate,
}: {
  group: { id: string; name: string; slug: string };
  members: Member[];
  session: SessionData;
  checkedInPlayerIds: string[];
  currentPlayerId: string;
  onUpdate: () => void;
}) {
  const round = session.currentRound;
  const [scores, setScores] = useState<{ scoreA: string; scoreB: string }[]>(
    () =>
      (round?.matches ?? []).map((m) => ({
        scoreA: m.scoreA != null ? String(m.scoreA) : "",
        scoreB: m.scoreB != null ? String(m.scoreB) : "",
      }))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [standings, setStandings] = useState<PlayerStanding[]>([]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const getName = (id: string) => memberMap.get(id)?.displayName ?? "Unknown";

  const fetchStandings = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/groups/${group.id}/sessions/${session.id}/standings`
      );
      if (res.ok) {
        const data = await res.json();
        setStandings(data.standings ?? []);
      }
    } catch {
      // Silently fail — standings are supplementary
    }
  }, [group.id, session.id]);

  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  const allScored = scores.every((s) => s.scoreA !== "" && s.scoreB !== "");

  function setScore(
    matchIndex: number,
    team: "scoreA" | "scoreB",
    value: string
  ) {
    setScores((prev) => {
      const next = [...prev];
      next[matchIndex] = { ...next[matchIndex], [team]: value };
      return next;
    });
  }

  async function submitAndNextRound() {
    if (!allScored) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/groups/${group.id}/sessions/${session.id}/next-round`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scores: scores.map((s) => ({
              scoreA: parseInt(s.scoreA, 10),
              scoreB: parseInt(s.scoreB, 10),
            })),
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to advance round");
        setLoading(false);
        return;
      }

      onUpdate();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  async function endSession(withScores: boolean) {
    setLoading(true);
    setError("");

    try {
      const body = withScores
        ? {
            scores: scores.map((s) => ({
              scoreA: parseInt(s.scoreA, 10),
              scoreB: parseInt(s.scoreB, 10),
            })),
          }
        : {};

      const res = await fetch(
        `/api/groups/${group.id}/sessions/${session.id}/end`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to end session");
        setLoading(false);
        return;
      }

      onUpdate();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  // Session completed — show summary
  if (session.status === "completed" || !round) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Session Complete</h1>
          <p className="mt-1 text-surface-muted">
            {session.roundNumber} round{session.roundNumber !== 1 ? "s" : ""}{" "}
            played. Stats have been updated.
          </p>
        </div>
        <Link href={`/groups/${group.slug}`} className="btn-primary inline-block">
          Back to Group
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/groups/${group.slug}`}
          className="text-sm text-surface-muted hover:text-dark-200"
        >
          &larr; Back to {group.name}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-dark-100">
            Round {round.roundNumber}
          </h1>
          <span className="badge-green">
            {checkedInPlayerIds.length} players
          </span>
        </div>
      </div>

      {/* Matches */}
      <div className="space-y-4">
        {round.matches.map((match, i) => (
          <div key={i} className="card space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-surface-muted">
              Court {i + 1}
            </p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Team A */}
              <div className="text-right">
                <p className="text-sm font-medium text-dark-100">
                  {getName(match.teamA[0])}
                </p>
                <p className="text-sm text-surface-muted">
                  {getName(match.teamA[1])}
                </p>
              </div>

              {/* Scores */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={scores[i]?.scoreA ?? ""}
                  onChange={(e) => setScore(i, "scoreA", e.target.value)}
                  className="input w-14 text-center text-lg font-bold"
                  placeholder="-"
                />
                <span className="text-surface-muted font-bold">:</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={scores[i]?.scoreB ?? ""}
                  onChange={(e) => setScore(i, "scoreB", e.target.value)}
                  className="input w-14 text-center text-lg font-bold"
                  placeholder="-"
                />
              </div>

              {/* Team B */}
              <div>
                <p className="text-sm font-medium text-dark-100">
                  {getName(match.teamB[0])}
                </p>
                <p className="text-sm text-surface-muted">
                  {getName(match.teamB[1])}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sitting players */}
      {round.sitting.length > 0 && (
        <div className="rounded-lg border border-surface-border bg-surface-overlay px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-surface-muted mb-1">
            Sitting out
          </p>
          <p className="text-sm text-dark-200">
            {round.sitting.map((id) => getName(id)).join(", ")}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={submitAndNextRound}
          disabled={!allScored || loading}
          className="btn-primary flex-1"
        >
          {loading ? "Submitting..." : "Submit Scores & Next Round"}
        </button>
        <button
          onClick={() => endSession(allScored)}
          disabled={loading}
          className="btn-secondary flex-1"
        >
          {allScored ? "Submit Scores & End Session" : "End Session"}
        </button>
      </div>

      {/* Session Standings */}
      {standings.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-muted">
            Session Standings
          </h2>

          {/* Mobile: card list */}
          <div className="space-y-1.5 sm:hidden">
            {standings.map((p, i) => (
              <div
                key={p.playerId}
                className={cn(
                  "card flex items-center gap-3 py-2.5",
                  p.playerId === currentPlayerId && "ring-2 ring-brand-500/40"
                )}
              >
                <span className="text-sm font-medium text-surface-muted w-5 text-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-dark-100 flex-1 min-w-0 truncate">
                  {p.displayName}
                </span>
                <span className="text-xs text-dark-200 shrink-0">
                  {p.wins}-{p.losses}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold shrink-0 w-10 text-right",
                    p.pointDiff > 0
                      ? "text-teal-300"
                      : p.pointDiff < 0
                        ? "text-red-400"
                        : "text-surface-muted"
                  )}
                >
                  {p.pointDiff > 0 ? "+" : ""}
                  {p.pointDiff}
                </span>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="card overflow-hidden p-0 hidden sm:block">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                    #
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Player
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    W
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    L
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    +/-
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {standings.map((p, i) => (
                  <tr
                    key={p.playerId}
                    className={cn(
                      p.playerId === currentPlayerId && "bg-brand-900/40"
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm text-surface-muted">
                      {i + 1}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-dark-100">
                      {p.displayName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-dark-100">
                      {p.wins}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm text-dark-100">
                      {p.losses}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold",
                        p.pointDiff > 0
                          ? "text-teal-300"
                          : p.pointDiff < 0
                            ? "text-red-400"
                            : "text-surface-muted"
                      )}
                    >
                      {p.pointDiff > 0 ? "+" : ""}
                      {p.pointDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
