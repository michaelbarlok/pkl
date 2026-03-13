"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface StartShootoutProps {
  sheetId: string;
  groupId: string;
  confirmedPlayerIds: string[];
  numCourts?: number;
}

export function StartShootout({
  sheetId,
  groupId,
  confirmedPlayerIds,
  numCourts: numCourtsProp,
}: StartShootoutProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (
      !confirm(
        "Create a shootout session from this sheet? Confirmed players will be added as participants."
      )
    )
      return;

    setStarting(true);
    setError(null);

    try {
      // Use sheet's configured courts, or calculate from player count
      const playerCount = confirmedPlayerIds.length;
      const numCourts = numCourtsProp
        ? Math.min(numCourtsProp, Math.floor(playerCount / 4) || 1)
        : Math.floor(playerCount / 4) || 1;

      const { data: session, error: sessionErr } = await supabase
        .from("shootout_sessions")
        .insert({
          sheet_id: sheetId,
          group_id: groupId,
          status: "created",
          num_courts: numCourts,
          current_round: 0,
          is_same_day_continuation: false,
        })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // Fetch current steps from group_memberships
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("player_id, current_step")
        .eq("group_id", groupId)
        .in("player_id", confirmedPlayerIds);

      const stepMap = new Map(
        (memberships ?? []).map((m: { player_id: string; current_step: number }) => [
          m.player_id,
          m.current_step,
        ])
      );

      const participants = confirmedPlayerIds.map((playerId) => ({
        session_id: session.id,
        group_id: groupId,
        player_id: playerId,
        checked_in: false,
        step_before: stepMap.get(playerId) ?? 1,
      }));

      if (participants.length > 0) {
        const { error: partErr } = await supabase
          .from("session_participants")
          .insert(participants);
        if (partErr) throw partErr;
      }

      router.push(`/admin/sessions/${session.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create session.";
      setError(message);
      setStarting(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleStart}
        disabled={starting || confirmedPlayerIds.length < 4}
        className="btn-primary w-full sm:w-auto"
        title={
          confirmedPlayerIds.length < 4
            ? "Need at least 4 confirmed players"
            : undefined
        }
      >
        {starting ? "Starting..." : "Start Shootout"}
      </button>
      {confirmedPlayerIds.length < 4 && (
        <p className="mt-1 text-xs text-surface-muted">
          Need at least 4 confirmed players
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
