"use client";

import { useConfirm } from "@/components/confirm-modal";
import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface StartShootoutProps {
  sheetId: string;
  groupId: string;
  confirmedPlayerIds: string[];
  activeSession?: { id: string; status: string } | null;
}

export function StartShootout({
  sheetId,
  groupId,
  confirmedPlayerIds,
  activeSession,
}: StartShootoutProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const confirm = useConfirm();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numCourts, setNumCourts] = useState<number | null>(null);

  // If there's already an active session, show a link to it instead
  if (activeSession) {
    return (
      <div>
        <a
          href={`/admin/sessions/${activeSession.id}`}
          className="btn-secondary w-full sm:w-auto text-center"
        >
          View Active Session ({activeSession.status.replace(/_/g, " ")})
        </a>
        <p className="mt-1 text-xs text-surface-muted">
          Complete the current session before starting a new one.
        </p>
      </div>
    );
  }

  // Compute valid court options (4-5 players per court)
  const courtOptions = Array.from(
    { length: Math.floor(confirmedPlayerIds.length / 4) },
    (_, i) => i + 1
  ).filter((n) => {
    const perCourt = confirmedPlayerIds.length / n;
    return perCourt >= 4 && perCourt <= 5;
  });

  async function handleStart() {
    if (!numCourts) {
      setError("Please select the number of courts.");
      return;
    }
    const ok = await confirm({
      title: "Start shootout session?",
      description: `${numCourts} court${numCourts > 1 ? "s" : ""} · ${confirmedPlayerIds.length} players`,
      confirmLabel: "Start Session",
      variant: "default",
    });
    if (!ok) return;

    setStarting(true);
    setError(null);

    try {
      // Block if there's already an active (non-complete) session
      const { data: activeSessions } = await supabase
        .from("shootout_sessions")
        .select("id, status")
        .eq("sheet_id", sheetId)
        .neq("status", "session_complete")
        .limit(1);

      if (activeSessions && activeSessions.length > 0) {
        setError("There is already an active session for this sheet. Complete it before starting a new one.");
        setStarting(false);
        return;
      }

      // Check for a previous completed session on the same sheet
      const { data: prevSessions } = await supabase
        .from("shootout_sessions")
        .select("id")
        .eq("sheet_id", sheetId)
        .eq("group_id", groupId)
        .in("status", ["session_complete", "round_complete"])
        .order("created_at", { ascending: false })
        .limit(1);

      const prevSessionId = prevSessions?.[0]?.id ?? null;
      const isContinuation = prevSessionId != null;

      // If continuing, fetch target_court_next from previous session
      let targetCourtMap = new Map<string, number>();
      if (isContinuation) {
        const { data: prevParticipants } = await supabase
          .from("session_participants")
          .select("player_id, target_court_next")
          .eq("session_id", prevSessionId)
          .not("target_court_next", "is", null);

        for (const pp of prevParticipants ?? []) {
          targetCourtMap.set(pp.player_id, pp.target_court_next!);
        }
      }

      const { data: session, error: sessionErr } = await supabase
        .from("shootout_sessions")
        .insert({
          sheet_id: sheetId,
          group_id: groupId,
          status: "created",
          num_courts: numCourts,
          current_round: 0,
          is_same_day_continuation: isContinuation,
          prev_session_id: prevSessionId,
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
        target_court_next: targetCourtMap.get(playerId) ?? null,
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
      {confirmedPlayerIds.length >= 4 && (
        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm font-medium text-dark-200">Courts:</label>
          <select
            value={numCourts ?? ""}
            onChange={(e) => setNumCourts(e.target.value ? Number(e.target.value) : null)}
            className="input w-20 py-1"
          >
            <option value="">—</option>
            {courtOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {numCourts && (
            <span className="text-xs text-surface-muted">
              {confirmedPlayerIds.length} players across {numCourts} court{numCourts > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
      <button
        onClick={handleStart}
        disabled={starting || confirmedPlayerIds.length < 4 || !numCourts}
        className="btn-primary w-full sm:w-auto"
        title={
          confirmedPlayerIds.length < 4
            ? "Need at least 4 confirmed players"
            : !numCourts
            ? "Select number of courts"
            : undefined
        }
      >
        {starting ? "Starting..." : "Start Session"}
      </button>
      {confirmedPlayerIds.length < 4 && (
        <p className="mt-1 text-xs text-surface-muted">
          Need at least 4 confirmed players
        </p>
      )}
      <FormError message={error} />
    </div>
  );
}
