"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

/**
 * Subscribes to postgres_changes on tournament_matches and
 * tournament_active_divisions for this tournament and triggers a
 * router.refresh() when anything changes. Drives the "no manual
 * refresh" promise on the Play tab — bracket updates, court
 * assignments, and division start/stop all re-render automatically.
 *
 * The channel is scoped by tournament_id filter so idle tabs watching
 * other tournaments don't get spammed. Refreshes are trailing-
 * debounced (200ms) so a burst of events (e.g. multiple matches
 * scoring at once or a division going live and immediately stamping
 * queue_entered_at on dozens of rows) coalesces into a single
 * refetch instead of N concurrent ones.
 */
export function LiveTournamentRealtime({ tournamentId }: { tournamentId: string }) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const debouncedRefresh = useDebouncedCallback(() => router.refresh(), 200);

  useEffect(() => {
    const channel = supabase
      .channel(`tournament-live-${tournamentId}`)
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
