"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";

/**
 * Site-wide "Head to Court N" modal.
 *
 * Mirrors ActiveSessionAlert but scoped to tournament match
 * assignments. Mounted once in the authenticated layout so it
 * triggers no matter where the player is in the app: when a
 * tournament match their team is on gets assigned a court, we pop
 * this modal. Acknowledging takes them to the Play tab, which
 * routes to their /tournaments/[id]/live view.
 *
 * Ack is persisted in localStorage keyed by match id so refreshing
 * or bouncing between pages doesn't re-trigger it, and so a second
 * court assignment for the same team (after they score the first)
 * still fires because it has a new match id.
 */
export function TournamentCourtAlert({ profileId }: { profileId: string }) {
  const { supabase } = useSupabase();
  const pathname = usePathname();

  const [active, setActive] = useState<{
    matchId: string;
    tournamentId: string;
    tournamentTitle: string;
    courtNumber: number;
  } | null>(null);

  const isAcked = useCallback((matchId: string) => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(`tournament-court-ack:${matchId}`) === "1";
  }, []);

  const setAcked = useCallback((matchId: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`tournament-court-ack:${matchId}`, "1");
  }, []);

  const checkForActive = useCallback(async () => {
    // Find every non-withdrawn registration tied to the viewer —
    // either as primary or as partner — then look at each
    // registration's tournament for a pending match on a court
    // whose team primary is the registration's player_id.
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("player_id, tournament_id, division")
      .or(`player_id.eq.${profileId},partner_id.eq.${profileId}`)
      .neq("status", "withdrawn");

    if (!regs || regs.length === 0) {
      setActive(null);
      return;
    }

    for (const reg of regs as any[]) {
      const teamPrimaryId = reg.player_id as string;
      const tournamentId = reg.tournament_id as string;

      const { data: match } = await supabase
        .from("tournament_matches")
        .select("id, court_number")
        .eq("tournament_id", tournamentId)
        .eq("status", "pending")
        .not("court_number", "is", null)
        .or(`player1_id.eq.${teamPrimaryId},player2_id.eq.${teamPrimaryId}`)
        .maybeSingle();

      if (!match || match.court_number == null) continue;
      if (isAcked(match.id)) continue;

      // Grab the tournament title for the modal copy — cheap, one-row.
      const { data: t } = await supabase
        .from("tournaments")
        .select("title")
        .eq("id", tournamentId)
        .single();

      setActive({
        matchId: match.id,
        tournamentId,
        tournamentTitle: t?.title ?? "your tournament",
        courtNumber: match.court_number,
      });
      return;
    }
    setActive(null);
  }, [supabase, profileId, isAcked]);

  useEffect(() => {
    checkForActive();
  }, [checkForActive, pathname]);

  // Realtime: UPDATE on tournament_matches might be our court
  // assignment landing. RLS scopes incoming events to matches the
  // viewer can see (tournament_matches SELECT is public for logged-
  // in users), so this stays cheap.
  useEffect(() => {
    const ch = supabase
      .channel(`tournament-court-alert-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tournament_matches",
        },
        () => {
          checkForActive();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, profileId, checkForActive]);

  // Refresh on refocus / visibility-change so a phone that was
  // backgrounded when the assignment landed still shows the modal.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") checkForActive();
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", checkForActive);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", checkForActive);
    };
  }, [checkForActive]);

  if (!active) return null;

  // Suppress when the viewer is already on the tournament live
  // view — the MyCourt hero there already shows the same info.
  if (pathname === `/tournaments/${active.tournamentId}/live`) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-court-alert-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
            <path d="M10 3.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM1.25 10a8.75 8.75 0 1 1 17.5 0 8.75 8.75 0 0 1-17.5 0Zm9.75-3a1 1 0 1 0-2 0v3.5a1 1 0 0 0 .55.9l2.5 1.25a1 1 0 0 0 .9-1.8L11 10.38V7Z" />
          </svg>
        </div>
        <div>
          <h2 id="tournament-court-alert-title" className="text-lg font-semibold text-dark-100">
            You&apos;re up
          </h2>
          <p className="mt-1 text-xs text-surface-muted">{active.tournamentTitle}</p>
          <p className="mt-2 text-sm text-surface-muted">You&apos;re on</p>
          <p className="mt-1 text-3xl font-bold text-brand-vivid">
            Court {active.courtNumber}
          </p>
          <p className="mt-2 text-sm text-surface-muted">
            Head there now. Tap below to see your bracket and partner.
          </p>
        </div>
        <Link
          href="/sessions/active"
          onClick={() => {
            setAcked(active.matchId);
            setActive(null);
          }}
          className="btn-primary w-full block"
        >
          Go to my court
        </Link>
        <button
          type="button"
          onClick={() => {
            setAcked(active.matchId);
            setActive(null);
          }}
          className="text-xs text-surface-muted hover:text-dark-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
