"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { getDivisionLabel } from "@/lib/divisions";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export interface CourtTrackerMatch {
  id: string;
  division: string | null;
  round: number;
  match_number: number;
  bracket: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  partner1_name: string | null;
  player2_name: string | null;
  partner2_name: string | null;
  court_number: number | null;
  queue_entered_at: string | null;
  status: string;
}

interface Props {
  tournamentId: string;
  numCourts: number;
  onCourt: CourtTrackerMatch[];
  queue: CourtTrackerMatch[];
}

/**
 * Organizer-only court control. Renders one card per court with the
 * current match, plus a queue list of matches eligible to play (prior
 * rounds done, both teams free, in an active division). Each queued
 * match has a "Send to Court N" button that appears for every open
 * court — the server still re-validates that neither team is on
 * another court when the click lands.
 *
 * Subscribes to tournament_matches + tournament_active_divisions so
 * the UI stays in sync as score entries free courts and new matches
 * become eligible.
 */
export function CourtTracker({
  tournamentId,
  numCourts,
  onCourt,
  queue,
}: Props) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [scoring, setScoring] = useState<CourtTrackerMatch | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`court-tracker-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_active_divisions",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router, tournamentId]);

  const courtsList = useMemo(() => {
    const byCourt = new Map<number, CourtTrackerMatch>();
    for (const m of onCourt) {
      if (m.court_number != null) byCourt.set(m.court_number, m);
    }
    return Array.from({ length: numCourts }, (_, i) => ({
      court: i + 1,
      match: byCourt.get(i + 1) ?? null,
    }));
  }, [onCourt, numCourts]);

  const openCourts = courtsList.filter((c) => !c.match).map((c) => c.court);

  async function send(matchId: string, court: number) {
    setBusy(`${matchId}:${court}`);
    setError("");
    const res = await fetch(`/api/tournaments/${tournamentId}/queue/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: matchId, court_number: court }),
    });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not send match");
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-dark-100">Court Tracker</h2>
        <p className="text-xs text-surface-muted mt-0.5">
          Live view of every court. When one frees up, pick a match from the queue to send to it.
        </p>
      </div>

      {/* Courts grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {courtsList.map(({ court, match }) => (
          <div
            key={court}
            className={
              "rounded-md border px-3 py-2.5 " +
              (match
                ? "border-brand-500/40 bg-brand-500/10"
                : "border-surface-border bg-surface-overlay")
            }
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-dark-200">
                Court {court}
              </p>
              <span
                className={
                  "text-[10px] font-semibold uppercase tracking-wide " +
                  (match ? "text-brand-vivid" : "text-surface-muted")
                }
              >
                {match ? "Live" : "Open"}
              </span>
            </div>
            {match ? (
              <div className="mt-1 text-xs space-y-1.5">
                <div className="space-y-0.5">
                  <p className="text-dark-100">
                    {formatTeam(match.player1_name, match.partner1_name)}
                    <span className="text-surface-muted"> vs </span>
                    {formatTeam(match.player2_name, match.partner2_name)}
                  </p>
                  <p className="text-surface-muted">
                    {match.division ? getDivisionLabel(match.division) : ""} ·{" "}
                    {bracketLabel(match.bracket)} · Round {match.round}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScoring(match)}
                  className="btn-primary text-[11px] py-1 px-2.5"
                >
                  Enter Score
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-surface-muted">
                Send a queued match to start play.
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Queue */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-muted">
            Match Queue ({queue.length})
          </h3>
          {openCourts.length > 0 && (
            <span className="text-[11px] text-brand-vivid">
              {openCourts.length} court{openCourts.length === 1 ? "" : "s"} open
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="mt-2 text-xs text-surface-muted">
            Nothing queued. Matches become eligible once the previous round in their pool finishes.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {queue.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-md bg-surface-overlay px-3 py-2"
              >
                <div className="text-xs min-w-0">
                  <p className="text-dark-100 truncate">
                    {formatTeam(m.player1_name, m.partner1_name)}
                    <span className="text-surface-muted"> vs </span>
                    {formatTeam(m.player2_name, m.partner2_name)}
                  </p>
                  <p className="text-surface-muted">
                    {m.division ? getDivisionLabel(m.division) : ""} ·{" "}
                    {bracketLabel(m.bracket)} · Round {m.round}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {openCourts.length === 0 ? (
                    <span className="text-[11px] text-surface-muted">Waiting on a court</span>
                  ) : (
                    openCourts.map((court) => (
                      <button
                        key={court}
                        type="button"
                        onClick={() => send(m.id, court)}
                        disabled={busy !== null}
                        className="btn-primary text-[11px] py-1 px-2 disabled:opacity-50"
                      >
                        {busy === `${m.id}:${court}` ? "…" : `Send to ${court}`}
                      </button>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {scoring && (
        <ScoreEntryModal
          match={scoring}
          tournamentId={tournamentId}
          onClose={() => setScoring(null)}
          onSaved={() => {
            setScoring(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Inline score-entry modal. Single-game entry — enough for pool
 * play and the common playoff case. Winner is derived from the
 * higher score; the API still performs its own validation and the
 * auto-queue engine runs once the score is saved.
 */
function ScoreEntryModal({
  match,
  tournamentId,
  onClose,
  onSaved,
}: {
  match: CourtTrackerMatch;
  tournamentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Escape-key close — standard modal UX. Locked to this modal
  // instance; removed on unmount.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Freeze body scroll while the modal is up so long bracket pages
  // don't keep scrolling behind a visible dialog.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function save() {
    setError("");
    const score1 = parseInt(s1);
    const score2 = parseInt(s2);
    if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 < 0 || score2 < 0) {
      setError("Enter both scores as non-negative numbers.");
      return;
    }
    if (score1 === score2) {
      setError("Tie scores aren't allowed — someone has to win.");
      return;
    }
    if (!match.player1_id || !match.player2_id) {
      setError("Match is missing a player id.");
      return;
    }
    const winner_id = score1 > score2 ? match.player1_id : match.player2_id;
    setSaving(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/bracket`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: match.id,
        score1: [score1],
        score2: [score2],
        winner_id,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not save score");
  }

  const teamA = formatTeam(match.player1_name, match.partner1_name);
  const teamB = formatTeam(match.player2_name, match.partner2_name);

  // Single-element wrapper carries both the backdrop styling and the
  // close handler — the old split (backdrop div + panel div) was
  // fragile on some browsers where pointer-events order let clicks
  // fall through the backdrop without firing. The panel stops click
  // propagation so typing/clicking inside doesn't dismiss.
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md rounded-t-xl sm:rounded-xl bg-surface-raised border border-surface-border shadow-2xl p-5 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-surface-muted">
              Court {match.court_number}
            </p>
            <h2 className="text-base font-semibold text-dark-100">Enter Score</h2>
            <p className="text-xs text-surface-muted mt-0.5">
              Saving flips this match to completed, frees the court, and the queue promotes the next match automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-muted hover:text-dark-100"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">
              {teamA}
            </label>
            <input
              type="number"
              min={0}
              value={s1}
              onChange={(e) => setS1(e.target.value)}
              className="input w-full"
              placeholder="Score"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">
              {teamB}
            </label>
            <input
              type="number"
              min={0}
              value={s2}
              onChange={(e) => setS2(e.target.value)}
              className="input w-full"
              placeholder="Score"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Score"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTeam(p1: string | null, p2: string | null): string {
  if (p1 && p2) return `${p1} / ${p2}`;
  return p1 ?? p2 ?? "TBD";
}

function bracketLabel(bracket: string): string {
  if (bracket === "playoff") return "Playoff";
  if (bracket === "winners") return "Pool A";
  if (bracket === "losers") return "Pool B";
  if (bracket.startsWith("pool_")) return `Pool ${bracket.slice(5)}`;
  return bracket;
}
