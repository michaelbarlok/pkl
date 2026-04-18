"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FormError } from "@/components/form-error";

interface PlayerStanding {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
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
  isAdmin?: boolean;
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
  isAdmin = false,
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
      isAdmin={isAdmin}
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

      <FormError message={error} />

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
  isAdmin,
  onUpdate,
}: {
  group: { id: string; name: string; slug: string };
  members: Member[];
  session: SessionData;
  checkedInPlayerIds: string[];
  currentPlayerId: string;
  isAdmin: boolean;
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

  // Admin edit mode — override current round assignments
  const [editMode, setEditMode] = useState(false);
  const [draftMatches, setDraftMatches] = useState<
    { teamA: [string, string]; teamB: [string, string] }[]
  >([]);
  const [draftSitting, setDraftSitting] = useState<string[]>([]);

  function enterEditMode() {
    if (!round) return;
    setDraftMatches(
      round.matches.map((m) => ({
        teamA: [m.teamA[0], m.teamA[1]],
        teamB: [m.teamB[0], m.teamB[1]],
      }))
    );
    setDraftSitting([...round.sitting]);
    setError("");
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setError("");
  }

  function setDraftPlayer(
    matchIdx: number,
    team: "A" | "B",
    slotIdx: number,
    playerId: string
  ) {
    setDraftMatches((prev) =>
      prev.map((m, i) => {
        if (i !== matchIdx) return m;
        if (team === "A") {
          const arr: [string, string] = [m.teamA[0], m.teamA[1]];
          arr[slotIdx] = playerId;
          return { ...m, teamA: arr };
        } else {
          const arr: [string, string] = [m.teamB[0], m.teamB[1]];
          arr[slotIdx] = playerId;
          return { ...m, teamB: arr };
        }
      })
    );
  }

  function setDraftSitter(slotIdx: number, playerId: string) {
    setDraftSitting((prev) => {
      const next = [...prev];
      next[slotIdx] = playerId;
      return next;
    });
  }

  function validateDraft(): string | null {
    const allIds = [
      ...draftMatches.flatMap((m) => [...m.teamA, ...m.teamB]),
      ...draftSitting,
    ];
    const checkedInSet = new Set(checkedInPlayerIds);
    const seen = new Set<string>();
    for (const id of allIds) {
      if (!id) return "All slots must be filled";
      if (!checkedInSet.has(id)) return `${getName(id)} is not in this session`;
      if (seen.has(id)) return `${getName(id)} is assigned more than once`;
      seen.add(id);
    }
    if (seen.size !== checkedInPlayerIds.length)
      return "All checked-in players must be assigned";
    return null;
  }

  async function saveOverride() {
    const err = validateDraft();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/groups/${group.id}/sessions/${session.id}/round`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matches: draftMatches,
            sitting: draftSitting,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        setLoading(false);
        return;
      }
      setEditMode(false);
      onUpdate();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

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
          <div className="flex items-center gap-2">
            <span className="badge-green">
              {checkedInPlayerIds.length} players
            </span>
            {isAdmin && !editMode && (
              <button
                type="button"
                onClick={enterEditMode}
                className="btn-secondary text-xs px-2 py-1"
              >
                Edit Assignments
              </button>
            )}
          </div>
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
              <div className="text-right space-y-1">
                {editMode ? (
                  <>
                    <select
                      value={draftMatches[i]?.teamA[0] ?? ""}
                      onChange={(e) => setDraftPlayer(i, "A", 0, e.target.value)}
                      className="input text-sm w-full"
                    >
                      {checkedInPlayerIds.map((id) => (
                        <option key={id} value={id}>{getName(id)}</option>
                      ))}
                    </select>
                    <select
                      value={draftMatches[i]?.teamA[1] ?? ""}
                      onChange={(e) => setDraftPlayer(i, "A", 1, e.target.value)}
                      className="input text-sm w-full"
                    >
                      {checkedInPlayerIds.map((id) => (
                        <option key={id} value={id}>{getName(id)}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-dark-100">{getName(match.teamA[0])}</p>
                    <p className="text-sm text-surface-muted">{getName(match.teamA[1])}</p>
                  </>
                )}
              </div>

              {/* Scores */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={scores[i]?.scoreA ?? ""}
                  onChange={(e) => setScore(i, "scoreA", e.target.value)}
                  className="input w-20 py-3 text-center text-2xl font-bold"
                  placeholder="—"
                  disabled={editMode}
                />
                <span className="text-surface-muted font-bold text-lg">:</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={scores[i]?.scoreB ?? ""}
                  onChange={(e) => setScore(i, "scoreB", e.target.value)}
                  className="input w-20 py-3 text-center text-2xl font-bold"
                  placeholder="—"
                  disabled={editMode}
                />
              </div>

              {/* Team B */}
              <div className="space-y-1">
                {editMode ? (
                  <>
                    <select
                      value={draftMatches[i]?.teamB[0] ?? ""}
                      onChange={(e) => setDraftPlayer(i, "B", 0, e.target.value)}
                      className="input text-sm w-full"
                    >
                      {checkedInPlayerIds.map((id) => (
                        <option key={id} value={id}>{getName(id)}</option>
                      ))}
                    </select>
                    <select
                      value={draftMatches[i]?.teamB[1] ?? ""}
                      onChange={(e) => setDraftPlayer(i, "B", 1, e.target.value)}
                      className="input text-sm w-full"
                    >
                      {checkedInPlayerIds.map((id) => (
                        <option key={id} value={id}>{getName(id)}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-dark-100">{getName(match.teamB[0])}</p>
                    <p className="text-sm text-surface-muted">{getName(match.teamB[1])}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sitting players */}
      {(round.sitting.length > 0 || editMode) && (
        <div className="rounded-lg border border-surface-border bg-surface-overlay px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-surface-muted mb-2">
            Sitting out
          </p>
          {editMode ? (
            <div className="space-y-1.5">
              {draftSitting.map((sid, si) => (
                <select
                  key={si}
                  value={sid}
                  onChange={(e) => setDraftSitter(si, e.target.value)}
                  className="input text-sm w-full"
                >
                  {checkedInPlayerIds.map((id) => (
                    <option key={id} value={id}>{getName(id)}</option>
                  ))}
                </select>
              ))}
              {draftSitting.length === 0 && (
                <p className="text-sm text-surface-muted">No one sitting out</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-dark-200">
              {round.sitting.map((id) => getName(id)).join(", ")}
            </p>
          )}
        </div>
      )}

      <FormError message={error} />

      {/* Actions */}
      {editMode ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={saveOverride}
            disabled={loading}
            className="btn-primary flex-1"
          >
            {loading ? "Saving..." : "Save Assignments"}
          </button>
          <button
            onClick={cancelEditMode}
            disabled={loading}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
        </div>
      ) : (
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
      )}

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
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                    {p.displayName.charAt(0)}
                  </div>
                )}
                <span className="text-sm font-medium text-dark-100 flex-1 min-w-0 truncate">
                  {p.displayName}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold text-dark-100">
                    {p.wins}-{p.losses}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold w-10 text-right",
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
                    Record
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
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {p.avatarUrl ? (
                          <img
                            src={p.avatarUrl}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                            {p.displayName.charAt(0)}
                          </div>
                        )}
                        <span className="text-sm font-medium text-dark-100">
                          {p.displayName}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-dark-100">
                      {p.wins}-{p.losses}
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
