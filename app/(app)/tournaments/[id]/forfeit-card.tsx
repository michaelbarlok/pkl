"use client";

import { useConfirm } from "@/components/confirm-modal";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface MatchRow {
  id: string;
  round: number;
  match_number: number;
  bracket: string;
  division: string | null;
  status: string;
  court_number: number | null;
  player1_id: string | null;
  player2_id: string | null;
  player1: { id: string; display_name: string } | null;
  player2: { id: string; display_name: string } | null;
}

interface Props {
  tournamentId: string;
  /** Tournament format. Used to disambiguate "winners" / "losers"
   *  bracket names — those are pool play in a round_robin tournament
   *  but elimination brackets in single/double elim, where
   *  "forfeit entire tournament" doesn't apply. */
  format: "round_robin" | "single_elimination" | "double_elimination";
  matches: MatchRow[];
}

/**
 * Organizer-only card for forfeiting a team out of a match (or the
 * entire pool, for pool-play matches). Lives in the live operational
 * column under Pool Play. Collapsed by default — most tournaments
 * never need it, but when a team is injured / no-shows / quits, the
 * organizer needs a clean way to record it without hand-typing
 * forfeit scores.
 *
 * Two modes mirror the API route at /api/tournaments/[id]/forfeit:
 *
 * - Match-only forfeit: forfeiting team keeps their current score
 *   (defaulting to 0 if the game hadn't started); winner gets the
 *   division's target score. Match completes normally and the bracket
 *   advances exactly like a regular score recording would.
 *
 * - Tournament forfeit (pool only): every pool match the team
 *   appears in is voided (deleted) so standings recompute as if they
 *   were never there. The registration is marked withdrawn.
 */
export function ForfeitCard({ tournamentId, format, matches }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [matchId, setMatchId] = useState("");
  const [forfeitingAnchor, setForfeitingAnchor] = useState<
    "player1" | "player2" | ""
  >("");
  const [currentScore, setCurrentScore] = useState(0);
  const [entireTournament, setEntireTournament] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Forfeitable = not yet completed, has both teams assigned, not a BYE.
  // Sorted with active courts first so an organizer reacting to an
  // in-progress emergency reaches the right match fastest.
  const forfeitableMatches = useMemo(() => {
    return matches
      .filter(
        (m) =>
          m.status !== "completed" &&
          m.status !== "bye" &&
          m.bracket !== "bye" &&
          m.player1_id &&
          m.player2_id
      )
      .sort((a, b) => {
        const aOnCourt = a.court_number != null ? 0 : 1;
        const bOnCourt = b.court_number != null ? 0 : 1;
        if (aOnCourt !== bOnCourt) return aOnCourt - bOnCourt;
        if ((a.division ?? "") !== (b.division ?? ""))
          return (a.division ?? "").localeCompare(b.division ?? "");
        if (a.bracket !== b.bracket) return a.bracket.localeCompare(b.bracket);
        if (a.round !== b.round) return a.round - b.round;
        return a.match_number - b.match_number;
      });
  }, [matches]);

  const selectedMatch = useMemo(
    () => forfeitableMatches.find((m) => m.id === matchId),
    [forfeitableMatches, matchId]
  );
  // In round_robin format, pool-play brackets can be named pool_X
  // OR "winners" / "losers" depending on the generator. In
  // single/double elim, every "winners" / "losers" bracket is an
  // elimination bracket where pool-forfeit doesn't apply.
  const isPoolMatch =
    !!selectedMatch?.bracket &&
    format === "round_robin" &&
    (selectedMatch.bracket.startsWith("pool_") ||
      selectedMatch.bracket === "winners" ||
      selectedMatch.bracket === "losers");

  function reset() {
    setMatchId("");
    setForfeitingAnchor("");
    setCurrentScore(0);
    setEntireTournament(false);
    setError("");
  }

  async function handleSubmit() {
    if (!selectedMatch || !forfeitingAnchor) return;

    const teamLabel =
      forfeitingAnchor === "player1"
        ? selectedMatch.player1?.display_name ?? "Team 1"
        : selectedMatch.player2?.display_name ?? "Team 2";

    const description = entireTournament
      ? `Every pool match for ${teamLabel} (completed or not) will be deleted, the team is marked withdrawn, and pool standings recompute as if they were never there. This cannot be undone.`
      : `${teamLabel} keeps their current score (${currentScore}); the other team is awarded the win at the division's target score. The match completes normally.`;

    const ok = await confirm({
      title: entireTournament ? "Forfeit entire tournament?" : "Forfeit this match?",
      description,
      confirmLabel: "Forfeit",
      variant: "danger",
    });
    if (!ok) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/forfeit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: selectedMatch.id,
          forfeiting_anchor: forfeitingAnchor,
          current_score: currentScore,
          entire_tournament: entireTournament,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Forfeit failed.");
        setSubmitting(false);
        return;
      }
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forfeit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-dark-100">Forfeit</h2>
          <p className="text-xs text-surface-muted mt-0.5">
            Mark a team as forfeiting a match — or pull them from a pool
            entirely.
          </p>
        </div>
        <span className="text-xs text-surface-muted ml-2">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Match picker */}
          <div>
            <label className="block text-xs font-medium text-dark-200 mb-1">
              Match
            </label>
            <select
              value={matchId}
              onChange={(e) => {
                setMatchId(e.target.value);
                setForfeitingAnchor("");
                setEntireTournament(false);
              }}
              className="input w-full text-sm"
            >
              <option value="">Select a match…</option>
              {forfeitableMatches.map((m) => {
                const onCourt =
                  m.court_number != null ? `(Court ${m.court_number}) ` : "";
                const div = m.division ? `${m.division} · ` : "";
                const bracketLabel = m.bracket?.startsWith("pool_")
                  ? `Pool ${m.bracket.replace(/^pool_/, "").toUpperCase()}`
                  : m.bracket === "playoff"
                  ? "Playoff"
                  : m.bracket === "grand_final"
                  ? "Final"
                  : m.bracket;
                const t1 = m.player1?.display_name ?? "TBD";
                const t2 = m.player2?.display_name ?? "TBD";
                return (
                  <option key={m.id} value={m.id}>
                    {onCourt}
                    {div}
                    {bracketLabel} R{m.round} M{m.match_number}: {t1} vs {t2}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Team picker */}
          {selectedMatch && (
            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">
                Forfeiting team
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["player1", "player2"] as const).map((slot) => {
                  const team =
                    slot === "player1" ? selectedMatch.player1 : selectedMatch.player2;
                  const active = forfeitingAnchor === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setForfeitingAnchor(slot)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-red-500 bg-red-900/20 text-red-300"
                          : "border-surface-border bg-surface-overlay text-dark-200 hover:bg-surface-raised"
                      }`}
                    >
                      {team?.display_name ?? "TBD"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Match-only details */}
          {selectedMatch && forfeitingAnchor && !entireTournament && (
            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">
                Points already earned by the forfeiting team
              </label>
              <input
                type="number"
                min={0}
                value={currentScore}
                onChange={(e) => setCurrentScore(Number(e.target.value) || 0)}
                className="input w-24 text-sm"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Defaults to 0 if the match hadn&apos;t started. The other team is
                awarded the win at the division&apos;s target score.
              </p>
            </div>
          )}

          {/* Tournament-forfeit toggle (pool only) — branded button
              instead of a native checkbox so the enabled / disabled
              state is unambiguous and the touch target is finger-
              sized on mobile. */}
          {selectedMatch && forfeitingAnchor && (
            <div className="space-y-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={entireTournament}
                aria-disabled={!isPoolMatch}
                onClick={() => {
                  if (!isPoolMatch) return;
                  setEntireTournament((v) => !v);
                }}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  !isPoolMatch
                    ? "cursor-not-allowed border-surface-border bg-surface-overlay/40 text-surface-muted"
                    : entireTournament
                      ? "border-red-500/60 bg-red-900/20 text-dark-100"
                      : "border-surface-border bg-surface-overlay text-dark-200 hover:bg-surface-raised"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Forfeit entire tournament</p>
                  <p className="text-xs text-surface-muted mt-0.5">
                    {isPoolMatch
                      ? "Removes the team from this pool, voids every pool match they're in (even completed ones), and recomputes standings."
                      : "Only available for pool-play matches. Use match-only forfeit for playoffs."}
                  </p>
                </div>
                {/* Pill indicator. Branded teal/red instead of the
                    OS-native checkmark so it matches the rest of the
                    organizer surface. */}
                <span
                  aria-hidden
                  className={`shrink-0 inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                    !isPoolMatch
                      ? "bg-surface-border"
                      : entireTournament
                        ? "bg-red-500"
                        : "bg-surface-border"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                      entireTournament && isPoolMatch ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedMatch || !forfeitingAnchor || submitting}
              className="btn-primary text-sm"
            >
              {submitting ? "Submitting…" : "Forfeit"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={submitting}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
