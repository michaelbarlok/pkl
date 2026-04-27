"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

/**
 * Subscribes to real-time changes on tournament_matches for a given tournament.
 * Triggers a server re-render (router.refresh()) when any match is inserted
 * or updated.
 *
 * The refresh is trailing-debounced (200ms) so a burst of N events inside
 * that window collapses into a single refetch. The page-level Promise.all
 * is expensive enough that re-running it for every score in a multi-court
 * flurry was the dominant load — this collapses bursts to a single refresh
 * without losing any data (the trailing call always fires after the last
 * event in the burst).
 */
export function TournamentRealtimeSubscription({ tournamentId }: { tournamentId: string }) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const debouncedRefresh = useDebouncedCallback(() => router.refresh(), 200);

  useEffect(() => {
    // Listen to both tournament_matches AND tournament_active_divisions
    // so the CourtTracker (which used to maintain its own duplicate
    // subscription on the same two tables) can rely on this one to
    // drive its refreshes — one channel per page instead of two.
    const channel = supabase
      .channel(`tournament-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => debouncedRefresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_active_divisions",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => debouncedRefresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tournamentId, debouncedRefresh]);

  return null;
}
