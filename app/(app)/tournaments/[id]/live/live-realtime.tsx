"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Subscribes to postgres_changes on tournament_matches and
 * tournament_active_divisions for this tournament and triggers a
 * router.refresh() when anything changes. Drives the "no manual
 * refresh" promise on the Play tab — bracket updates, court
 * assignments, and division start/stop all re-render automatically.
 *
 * The channel is scoped by tournament_id filter so idle tabs watching
 * other tournaments don't get spammed.
 */
export function LiveTournamentRealtime({ tournamentId }: { tournamentId: string }) {
  const { supabase } = useSupabase();
  const router = useRouter();

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

  return null;
}
