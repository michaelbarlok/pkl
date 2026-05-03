"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useConfirm } from "@/components/confirm-modal";
import { getDivisionLabel } from "@/lib/divisions";
import { FirstChoiceBadge } from "@/components/first-choice-badge";
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
  /** Pre-computed bracket-aware label, e.g. "Pool A · Round 3",
   *  "Semifinal", "Final", "3rd Place". Parent calculates because
   *  it has access to the per-division max playoff round. */
  position_label: string;
  /** Server-resolved first-choice for this match. Pool play is
   *  balanced across teams; playoffs go to the higher seed. Null
   *  when the match isn't ready (BYE, unknown teams, etc.). */
  first_choice?: "team1" | "team2" | null;
}

export interface CourtRange {
  id: string;
  label: string;
  court_start: number;
  court_end: number;
  divisions: string[];
}

interface Props {
  tournamentId: string;
  numCourts: number;
  onCourt: CourtTrackerMatch[];
  queue: CourtTrackerMatch[];
  /** Optional court-range layout. When present, the Match Queue
   *  splits into one queue per range (showing only matches whose
   *  division belongs to that range). When empty/absent, the queue
   *  renders as one global list — legacy behavior. The court grid
   *  above the queue stays single across all courts either way. */
  courtRanges?: CourtRange[];
  /** Tournament-level score-to-win defaults; division overrides
   *  in `divisionSettings` win when present. Used by the inline
   *  ScoreEntryModal to validate before round-tripping. */
  scoreToWinPool?: number;
  scoreToWinPlayoff?: number;
  winBy2?: boolean;
  divisionSettings?: Record<
    string,
    { score_to_win_pool?: number; score_to_win_playoff?: number } | null
  > | null;
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
  courtRanges,
  scoreToWinPool,
  scoreToWinPlayoff,
  winBy2,
  divisionSettings,
}: Props) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const confirm = useConfirm();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [scoring, setScoring] = useState<CourtTrackerMatch | null>(null);

  // Realtime updates for tournament_matches + tournament_active_divisions
  // are handled by the parent page's <TournamentRealtimeSubscription>,
  // which lives at the page root and triggers a debounced
  // router.refresh() shared across every component on the page. We
  // used to maintain a duplicate channel here that fired the same
  // refresh — dropping it halves the realtime connection count per
  // organizer with the page open and is a no-op for behavior since
  // the parent refresh re-passes new props.

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

  // Range-aware court-grid sections. Same layout idea as the queue
  // Range panels: per-range structure that owns BOTH the courts
  // grid (rendered up top) AND the matching queue (rendered as a
  // collapsible just below the courts in the same section). Used
  // to be two parallel useMemos — one for courts, one for queue —
  // grouped by separate render blocks. Combining them lets each
  // range render as a self-contained block, which keeps the card
  // shorter on screen and makes "this range's queue" obvious.
  //
  // No ranges defined → single un-labelled panel (legacy look).
  // Ranges defined  → one panel per range, plus an "Unassigned
  //                   divisions" trailer if any matches exist
  //                   for divisions not pinned to a range.
  const rangePanels = useMemo(() => {
    type Panel = {
      key: string;
      label: string | null;
      sublabel: string | null;
      courts: typeof courtsList;
      openCourtsInRange: number[];
      queue: CourtTrackerMatch[];
    };
    if (!courtRanges || courtRanges.length === 0) {
      return [{
        key: "all",
        label: null,
        sublabel: null,
        courts: courtsList,
        openCourtsInRange: openCourts,
        queue,
      } as Panel];
    }
    const rangedDivisions = new Set<string>();
    const rangedCourts = new Set<number>();
    for (const r of courtRanges) {
      for (const d of r.divisions) rangedDivisions.add(d);
      for (let c = r.court_start; c <= r.court_end; c++) rangedCourts.add(c);
    }
    const panels: Panel[] = [];
    for (const r of courtRanges) {
      const cards = courtsList.filter(
        (c) => c.court >= r.court_start && c.court <= r.court_end
      );
      const openInRange: number[] = [];
      for (let c = r.court_start; c <= r.court_end; c++) {
        if (openCourts.includes(c)) openInRange.push(c);
      }
      const matches = queue.filter(
        (m) => m.division != null && r.divisions.includes(m.division)
      );
      panels.push({
        key: r.id,
        label: `${r.label} · Courts ${r.court_start}–${r.court_end}`,
        sublabel:
          r.divisions.length > 0
            ? r.divisions.map((d) => getDivisionLabel(d)).join(" · ")
            : "No divisions assigned",
        courts: cards,
        openCourtsInRange: openInRange,
        queue: matches,
      });
    }
    const unrangedCards = courtsList.filter((c) => !rangedCourts.has(c.court));
    const unrangedMatches = queue.filter(
      (m) => m.division == null || !rangedDivisions.has(m.division)
    );
    if (unrangedCards.length > 0 || unrangedMatches.length > 0) {
      const unrangedOpen = openCourts.filter((c) => !rangedCourts.has(c));
      panels.push({
        key: "unranged",
        label: unrangedCards.length > 0
          ? `Other courts · ${unrangedCards.map((c) => c.court).join(", ")}`
          : "Unassigned divisions",
        sublabel: "Open to any unassigned division",
        courts: unrangedCards,
        openCourtsInRange: unrangedOpen,
        queue: unrangedMatches,
      });
    }
    return panels;
  }, [courtRanges, courtsList, openCourts, queue]);

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

  /**
   * Pull a match off its court and back into the queue at position 2
   * (one match ahead of them before they play again). Useful when a
   * team isn't ready and needs a few extra minutes. Confirms first
   * so a stray tap doesn't disrupt an active game.
   */
  async function unassign(matchId: string) {
    const ok = await confirm({
      title: "Bump this match?",
      description:
        "The match goes back to the queue at position 2 — one match will play before them, giving them a couple more minutes.",
      confirmLabel: "Bump",
      cancelLabel: "Never mind",
      variant: "warning",
    });
    if (!ok) return;
    setBusy(`unassign:${matchId}`);
    setError("");
    const res = await fetch(
      `/api/tournaments/${tournamentId}/queue/promote?match_id=${encodeURIComponent(matchId)}`,
      { method: "DELETE" }
    );
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not unassign match");
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-dark-100">Court Tracker</h2>
        <p className="text-xs text-surface-muted mt-0.5">
          Live view of every court. When one frees up, pick a match from the queue to send to it.
        </p>
      </div>

      {/* Courts grid. Always one column on narrow screens (mobile).
          From sm+ we use auto-fit with a ~260px minimum per tile so
          the grid packs 2 / 3 / 4 columns based on whatever width
          the lane actually has — no hardcoded breakpoint math.
          >10-court tournaments get a tighter tile (minimum 220px)
          AND tighter padding so three columns fit comfortably in
          the Court Tracker lane on standard laptops. */}
      <div className="space-y-4">
      {rangePanels.map((section) => (
      <div key={section.key}>
        {section.label && (
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-l-2 border-brand-500/60 pl-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-dark-100">
              {section.label}
            </h4>
            {section.sublabel && (
              <p className="text-[11px] text-surface-muted">{section.sublabel}</p>
            )}
          </div>
        )}
      <div
        className="grid grid-cols-1 gap-2 sm:[grid-template-columns:repeat(auto-fit,minmax(var(--court-min,260px),1fr))]"
        style={
          {
            ["--court-min" as any]: numCourts > 10 ? "220px" : "260px",
          } as React.CSSProperties
        }
      >
        {section.courts.map(({ court, match }) => (
          <div
            key={court}
            className={
              "rounded-lg border shadow-sm " +
              (numCourts > 10 ? "px-3 py-2" : "px-4 py-3") +
              " " +
              (match
                ? "border-brand-500/40 bg-brand-500/10"
                : "border-surface-border bg-surface-overlay")
            }
          >
            <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
              <p className="text-sm font-semibold text-dark-100">
                Court {court}
              </p>
              <span
                className={
                  "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide " +
                  (match ? "text-brand-vivid" : "text-surface-muted")
                }
              >
                {match && <span className="h-1.5 w-1.5 rounded-full bg-brand-vivid animate-pulse" />}
                {match ? "Live" : "Open"}
              </span>
            </div>
            {match ? (
              <div className="mt-2 space-y-2.5">
                {/* Teams stacked full-width with a centred "vs"
                    divider. On the live court cards the
                    side-by-side 1fr·auto·1fr grid made wrap
                    points jagged when one team had long doubles
                    names and the other didn't — every card reads
                    consistently when each team gets a full row. */}
                <div className="space-y-1">
                  <p className="text-sm text-dark-100 font-medium break-words flex items-center gap-1.5">
                    <span>{formatTeam(match.player1_name, match.partner1_name)}</span>
                    {match.first_choice === "team1" && <FirstChoiceBadge className="shrink-0" />}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-surface-muted uppercase tracking-wide">
                    <span className="h-px flex-1 bg-surface-border" />
                    <span>vs</span>
                    <span className="h-px flex-1 bg-surface-border" />
                  </div>
                  <p className="text-sm text-dark-100 font-medium break-words flex items-center gap-1.5">
                    <span>{formatTeam(match.player2_name, match.partner2_name)}</span>
                    {match.first_choice === "team2" && <FirstChoiceBadge className="shrink-0" />}
                  </p>
                </div>
                <p className="text-xs text-surface-muted">
                  {match.division ? getDivisionLabel(match.division) : ""} · {match.position_label}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScoring(match)}
                    className="btn-primary text-xs py-1.5 px-3 flex-1 sm:flex-none"
                  >
                    Enter Score
                  </button>
                  <button
                    type="button"
                    onClick={() => unassign(match.id)}
                    disabled={busy === `unassign:${match.id}`}
                    className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
                    title="Team not ready — send them back to the queue for a few more minutes"
                  >
                    {busy === `unassign:${match.id}` ? "…" : "Bump"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-surface-muted">
                Send a queued match to start play.
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Per-range Match Queue — collapsed by default so the
          tracker stays short on screen. Native <details> handles
          state for free; the chevron rotates via the open: marker
          variant. The queue list, "Send to N" buttons, and "n
          waiting" copy all match the legacy bottom-of-card render
          one-for-one — just relocated under each range's grid. */}
      <details className="mt-3 group rounded-md bg-surface-overlay/40 ring-1 ring-surface-border/60">
        <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-muted">
            <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
            </svg>
            Match Queue ({section.queue.length})
          </span>
          {section.openCourtsInRange.length > 0 && (
            <span className="text-[11px] text-brand-vivid">
              {section.openCourtsInRange.length} open
            </span>
          )}
        </summary>
        <div className="px-3 pb-3 pt-1">
          {section.queue.length === 0 ? (
            <p className="text-xs text-surface-muted italic">
              No matches queued for this range right now.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {section.queue.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-md bg-surface-overlay ring-1 ring-dark-500 shadow-sm px-3 py-2"
                >
                  <div className="text-xs min-w-0 flex-1">
                    {/* Stacked teams on mobile, side-by-side from sm
                        upward. The old 3-column grid forced long
                        doubles names ("[TEST] M27 Greg Ellis") to
                        wrap onto 3+ lines per team in narrow columns
                        — leaving the card mostly whitespace. Stacking
                        each team on its own row uses the full card
                        width and reads clean. */}
                    <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
                      <p className="text-dark-100 break-words min-w-0 flex items-center gap-1.5 sm:text-left">
                        <span>{formatTeam(m.player1_name, m.partner1_name)}</span>
                        {m.first_choice === "team1" && <FirstChoiceBadge className="shrink-0" />}
                      </p>
                      <span className="text-[10px] text-surface-muted uppercase tracking-wide sm:self-center">vs</span>
                      <p className="text-dark-100 break-words min-w-0 flex items-center gap-1.5 sm:text-right sm:justify-end">
                        {m.first_choice === "team2" && <FirstChoiceBadge className="shrink-0" />}
                        <span>{formatTeam(m.player2_name, m.partner2_name)}</span>
                      </p>
                    </div>
                    <p className="text-surface-muted mt-1">
                      {m.division ? getDivisionLabel(m.division) : ""} · {m.position_label}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {section.openCourtsInRange.length === 0 ? (
                      <span className="text-[11px] text-surface-muted">Waiting on a court</span>
                    ) : (
                      section.openCourtsInRange.map((court) => (
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
      </details>
      </div>
      ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {scoring && (() => {
        const isPlayoff =
          scoring.bracket === "playoff" || scoring.bracket === "grand_final";
        const override = scoring.division
          ? divisionSettings?.[scoring.division]
          : null;
        const effectiveScoreToWin = isPlayoff
          ? override?.score_to_win_playoff ?? scoreToWinPlayoff
          : override?.score_to_win_pool ?? scoreToWinPool;
        return (
          <ScoreEntryModal
            match={scoring}
            tournamentId={tournamentId}
            scoreToWin={effectiveScoreToWin}
            winBy2={winBy2}
            onClose={() => setScoring(null)}
            onSaved={() => {
              setScoring(null);
              router.refresh();
            }}
          />
        );
      })()}
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
  scoreToWin,
  winBy2,
  onClose,
  onSaved,
}: {
  match: CourtTrackerMatch;
  tournamentId: string;
  scoreToWin?: number;
  winBy2?: boolean;
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
    if (saving) return;
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
    // Mirror the server-side scoring rule check so a clearly invalid
    // entry (e.g. 5-3 in a game to 11) is caught before we round-trip.
    if (typeof scoreToWin === "number" && scoreToWin > 0) {
      const hi = Math.max(score1, score2);
      const lo = Math.min(score1, score2);
      if (hi < scoreToWin) {
        setError(
          winBy2
            ? `At least one team must reach ${scoreToWin} (win by 2).`
            : `At least one team must reach ${scoreToWin}.`
        );
        return;
      }
      if (winBy2) {
        if (hi === scoreToWin) {
          if (hi - lo < 2) {
            setError(`Win by 2 — ${hi}-${lo} isn't a valid finish.`);
            return;
          }
        } else if (hi - lo !== 2) {
          setError(
            `Win by 2 — once past ${scoreToWin}, the winner must lead by exactly 2 (e.g. ${scoreToWin + 1}-${scoreToWin - 1}).`
          );
          return;
        }
      }
    }
    const winner_id = score1 > score2 ? match.player1_id : match.player2_id;
    setSaving(true);
    try {
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
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save score");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
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

