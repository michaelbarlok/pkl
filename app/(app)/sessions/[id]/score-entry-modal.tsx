"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { FirstChoiceBadge } from "@/components/first-choice-badge";
import { matchFirstChoice } from "@/lib/first-choice";

export interface ScoreEntryTarget {
  courtNum: number;
  gameNumber: number;
  team1: string[];
  team2: string[];
}

interface Props {
  sessionId: string;
  target: ScoreEntryTarget | null;
  currentRound: number;
  playerNames: Map<string, string>;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * In-page score entry dialog — replaces the old full-page navigation
 * to /sessions/[id]/score for the common "tap a blank match" flow.
 *
 * Behaviors it inherits from the standalone page:
 *   - fetchWithRetry (4 attempts, slow-threshold indicator) so flaky
 *     courtside LTE doesn't silently drop a score
 *   - 4xx surfaces the server message immediately (duplicate 409 etc.)
 *   - First-choice badge tags whichever team holds it for this match
 *
 * What's different:
 *   - No page navigation: the page-level Realtime subscription on
 *     game_results picks up the insert and re-renders the match row
 *     automatically within ~1s of save
 *   - Escape + backdrop click + explicit Cancel button dismiss
 *   - Team-A score input autofocuses when the dialog opens so the
 *     scorekeeper can start typing immediately
 */
export function ScoreEntryModal({
  sessionId,
  target,
  currentRound,
  playerNames,
  onClose,
  onSaved,
}: Props) {
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Reset on each new target so the previous score values don't leak
  // across openings.
  useEffect(() => {
    if (target) {
      setScoreA("");
      setScoreB("");
      setError("");
      setSlow(false);
      setSubmitting(false);
      // Defer focus until after the input is mounted.
      const t = setTimeout(() => firstInputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, submitting, onClose]);

  if (!target) return null;

  const formatTeam = (ids: string[]) =>
    ids.map((id) => playerNames.get(id) ?? "?").join(" & ");

  const firstChoice = matchFirstChoice(
    sessionId,
    target.courtNum,
    target.gameNumber
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    setSlow(false);

    // target is non-null by the `if (!target) return null` guard above;
    // re-grab it into a local so TypeScript narrows correctly inside
    // the async closure.
    const t = target!;

    try {
      const res = await fetchWithRetry(
        `/api/sessions/${sessionId}/score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            round_number: currentRound,
            pool_number: t.courtNum,
            team_a_p1: t.team1[0],
            team_a_p2: t.team1[1] ?? null,
            team_b_p1: t.team2[0],
            team_b_p2: t.team2[1] ?? null,
            score_a: parseInt(scoreA, 10),
            score_b: parseInt(scoreB, 10),
          }),
        },
        { onSlow: setSlow }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit score");
        setSubmitting(false);
        setSlow(false);
        return;
      }

      // Success: let the parent close the modal AND kick a refetch in
      // case Realtime hasn't delivered the INSERT yet on a slow link.
      onSaved();
      onClose();
    } catch {
      setError("Network issue — please try again.");
      setSubmitting(false);
      setSlow(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="score-entry-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in">
        <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
          <header className="text-center space-y-1">
            <p className="text-xs font-semibold text-surface-muted uppercase tracking-wider">
              Court {target.courtNum} · Game {target.gameNumber}
            </p>
            <h2
              id="score-entry-title"
              className="text-base font-semibold text-dark-100 flex items-center justify-center gap-2 flex-wrap"
            >
              <span>{formatTeam(target.team1)}</span>
              {firstChoice === "team1" && <FirstChoiceBadge />}
            </h2>
            <p className="text-xs text-surface-muted">vs</p>
            <h2 className="text-base font-semibold text-dark-100 flex items-center justify-center gap-2 flex-wrap">
              <span>{formatTeam(target.team2)}</span>
              {firstChoice === "team2" && <FirstChoiceBadge />}
            </h2>
          </header>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {/* min-w-0 on each column lets the `truncate` label collapse
                under its own text width. Without it, the 1fr tracks
                floor at the label's intrinsic width and push the whole
                grid past the modal's right edge on long names. */}
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-surface-muted mb-2 text-center uppercase tracking-wider truncate">
                {formatTeam(target.team1)}
              </label>
              <input
                ref={firstInputRef}
                type="number"
                min={0}
                inputMode="numeric"
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
                className="input text-center text-3xl font-bold py-5 sm:text-2xl sm:py-3 w-full"
                placeholder="0"
                required
              />
            </div>
            <span className="text-lg font-bold text-surface-muted mt-6">—</span>
            <div className="min-w-0">
              <label className="block text-xs font-semibold text-surface-muted mb-2 text-center uppercase tracking-wider truncate">
                {formatTeam(target.team2)}
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
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
              disabled={submitting}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || scoreA === "" || scoreB === ""}
              className="btn-primary flex-1"
            >
              {submitting ? (slow ? "Still working..." : "Submitting...") : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
