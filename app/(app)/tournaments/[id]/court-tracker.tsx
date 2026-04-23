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
              <div className="mt-1 text-xs space-y-0.5">
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
