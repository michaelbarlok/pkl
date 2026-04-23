"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { getDivisionLabel } from "@/lib/divisions";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
                className="flex items-start justify-between gap-3 rounded-md bg-surface-overlay ring-1 ring-dark-500 shadow-sm px-3 py-2"
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
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Escape closes (unless we're mid-save so a click/keyboard race
  // doesn't kill the in-flight request).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Autofocus the first score input so the organizer can start
  // typing as soon as the modal is up — same pattern as the ladder
  // session score modal.
  useEffect(() => {
    const t = setTimeout(() => firstInputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, []);

  // Portals need document, so gate mount to avoid SSR/hydration
  // mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Freeze body scroll while the modal is up, and compensate the
  // now-missing scrollbar with padding-right so the viewport doesn't
  // jump sideways on Chrome.
  useEffect(() => {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
    if (res.ok) {
      onSaved();
      return;
    }
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not save score");
  }

  // Stack partner names vertically inside each score column for
  // consistency with the ladder session modal — partners are fully
  // visible on one row each instead of being squashed together.
  const teamANames = [match.player1_name, match.partner1_name].filter(
    (x): x is string => !!x
  );
  const teamBNames = [match.player2_name, match.partner2_name].filter(
    (x): x is string => !!x
  );

  // Portal to document.body so the modal lives outside the tournament
  // page's stacking context.
  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-score-entry-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => {
          if (!saving) onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in">
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <header className="text-center space-y-1">
            <p className="text-xs font-semibold text-surface-muted uppercase tracking-wider">
              Court {match.court_number} ·{" "}
              {match.division ? getDivisionLabel(match.division) : ""} · Round{" "}
              {match.round}
            </p>
            <h2
              id="tournament-score-entry-title"
              className="text-base font-semibold text-dark-100"
            >
              {teamANames.join(" & ") || "Team A"}
            </h2>
            <p className="text-xs text-surface-muted">vs</p>
            <h2 className="text-base font-semibold text-dark-100">
              {teamBNames.join(" & ") || "Team B"}
            </h2>
          </header>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="min-w-0">
              <div className="mb-2 text-xs font-semibold text-surface-muted text-center uppercase tracking-wider leading-tight break-words space-y-0.5">
                {teamANames.length > 0
                  ? teamANames.map((n, i) => <div key={i}>{n}</div>)
                  : <div>Team A</div>}
              </div>
              <input
                ref={firstInputRef}
                type="number"
                min={0}
                inputMode="numeric"
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                className="input text-center text-3xl font-bold py-5 sm:text-2xl sm:py-3 w-full"
                placeholder="0"
                required
              />
            </div>
            <span className="text-lg font-bold text-surface-muted mt-6">—</span>
            <div className="min-w-0">
              <div className="mb-2 text-xs font-semibold text-surface-muted text-center uppercase tracking-wider leading-tight break-words space-y-0.5">
                {teamBNames.length > 0
                  ? teamBNames.map((n, i) => <div key={i}>{n}</div>)
                  : <div>Team B</div>}
              </div>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={s2}
                onChange={(e) => setS2(e.target.value)}
                className="input text-center text-3xl font-bold py-5 sm:text-2xl sm:py-3 w-full"
                placeholder="0"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || s1 === "" || s2 === ""}
              className="btn-primary flex-1"
            >
              {saving ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return mounted ? createPortal(modal, document.body) : null;
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
