"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import {
  SESSION_LIFECYCLE_LABELS,
  SESSION_LIFECYCLE_ORDER,
} from "@/lib/status-colors";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ParticipantRow {
  player_id: string;
  checked_in?: boolean;
  target_court_next?: number | null;
}

interface SessionLike {
  id: string;
  status: string;
  group_id: string;
  sheet_id: string;
  num_courts: number | null;
  current_round: number | null;
}

/**
 * Admin-only controls on the Play tab.
 *
 * Mirrors the session-lifecycle workflow that used to live only on
 * /admin/sessions/[id]: a pill row showing the current stage, plus
 * the right action button(s) for that stage.
 *
 * Logic is duplicated from the admin page on purpose — keeping the
 * admin page untouched avoids accidental regressions on the richer
 * admin view (per-court seeding, roster overrides, delete button).
 * If we later DRY these two together, the extraction point is this
 * file's handlers.
 */
export function SessionAdminControls({
  session,
  participants,
  onChange,
}: {
  session: SessionLike;
  participants: ParticipantRow[];
  onChange: () => void;
}) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [startingNext, setStartingNext] = useState(false);

  const currentIdx = SESSION_LIFECYCLE_ORDER.indexOf(
    session.status as (typeof SESSION_LIFECYCLE_ORDER)[number]
  );

  async function advanceStatus() {
    if (currentIdx < 0 || currentIdx >= SESSION_LIFECYCLE_ORDER.length - 1) return;
    const nextStatus = SESSION_LIFECYCLE_ORDER[currentIdx + 1];

    setUpdating(true);
    setAdvanceError(null);

    if (nextStatus === "round_complete") {
      // round_active → round_complete goes through the API so all
      // scores get validated + pool_finish / win_pct / steps get
      // recomputed atomically.
      const res = await fetch(`/api/sessions/${session.id}/complete-round`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setAdvanceError(data.error ?? "Failed to complete round");
        setUpdating(false);
        return;
      }
    } else {
      await supabase
        .from("shootout_sessions")
        .update({ status: nextStatus })
        .eq("id", session.id);
    }

    onChange();
    setUpdating(false);
  }

  async function endSession() {
    setUpdating(true);
    const res = await fetch(`/api/sessions/${session.id}/end`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAdvanceError(data.error ?? "Failed to end session");
    }
    onChange();
    setUpdating(false);
  }

  async function startNextSession() {
    // Mirrors /admin/sessions/[id]:startNextSession — mark current
    // complete, create a new shootout_session with status=created,
    // copy the checked-in roster with their target_court_next from
    // this session's recompute, then redirect to the new Play tab.
    setStartingNext(true);
    setAdvanceError(null);

    try {
      await supabase
        .from("shootout_sessions")
        .update({ status: "session_complete" })
        .eq("id", session.id);

      const targetCourtMap = new Map<string, number>();
      for (const p of participants) {
        if (p.target_court_next != null) {
          targetCourtMap.set(p.player_id, p.target_court_next);
        }
      }

      const { data: newSession, error: sessErr } = await supabase
        .from("shootout_sessions")
        .insert({
          sheet_id: session.sheet_id,
          group_id: session.group_id,
          status: "created",
          // Default to the same court count. Admins who want a
          // different count can use the richer picker on
          // /admin/sessions/[id] before advancing.
          num_courts: session.num_courts ?? 1,
          current_round: 0,
          is_same_day_continuation: true,
          prev_session_id: session.id,
        })
        .select()
        .single();

      if (sessErr || !newSession) throw sessErr ?? new Error("Insert failed");

      const checkedInIds = participants
        .filter((p) => p.checked_in)
        .map((p) => p.player_id);

      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("player_id, current_step")
        .eq("group_id", session.group_id)
        .in("player_id", checkedInIds);

      const stepMap = new Map(
        (memberships ?? []).map(
          (m: { player_id: string; current_step: number }) => [
            m.player_id,
            m.current_step,
          ]
        )
      );

      const newParticipants = checkedInIds.map((playerId) => ({
        session_id: newSession.id,
        group_id: session.group_id,
        player_id: playerId,
        checked_in: false,
        step_before: stepMap.get(playerId) ?? 1,
        target_court_next: targetCourtMap.get(playerId) ?? null,
      }));

      if (newParticipants.length > 0) {
        const { error: partErr } = await supabase
          .from("session_participants")
          .insert(newParticipants);
        if (partErr) throw partErr;
      }

      router.push(`/sessions/${newSession.id}`);
    } catch (err) {
      setStartingNext(false);
      setAdvanceError(
        err instanceof Error ? err.message : "Failed to start next session"
      );
    }
  }

  const isTerminal = session.status === "session_complete";
  const nextLabel = !isTerminal
    ? SESSION_LIFECYCLE_LABELS[SESSION_LIFECYCLE_ORDER[currentIdx + 1]]
    : null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-surface-muted">
          Session Lifecycle
        </p>
        <span className="badge-admin">Admin</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {SESSION_LIFECYCLE_ORDER.map((status, idx) => (
          <div key={status} className="flex items-center">
            <div
              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                idx < currentIdx
                  ? "bg-teal-900/30 text-teal-300"
                  : idx === currentIdx
                  ? "bg-brand-900/50 text-brand-300 ring-2 ring-brand-500"
                  : "bg-surface-overlay text-surface-muted"
              }`}
            >
              {SESSION_LIFECYCLE_LABELS[status]}
            </div>
            {idx < SESSION_LIFECYCLE_ORDER.length - 1 && (
              <svg
                className="mx-1 h-4 w-4 text-surface-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Check-in is a dedicated page for seeding + roster. Before
             the round is live, send the admin there; after, show the
             advance / end / play-again buttons here. */}
        {(session.status === "created" ||
          session.status === "checking_in" ||
          session.status === "seeding") && (
          <a
            href={`/admin/sessions/${session.id}/checkin`}
            className="btn-primary"
          >
            {session.status === "created" ? "Start Check-In" : "Manage Check-In"}
          </a>
        )}

        {session.status === "round_complete" ? (
          <>
            <button
              type="button"
              onClick={startNextSession}
              disabled={startingNext || updating}
              className="btn-primary"
            >
              {startingNext ? "Starting..." : "Play Again"}
            </button>
            <button
              type="button"
              onClick={endSession}
              disabled={updating || startingNext}
              className="btn-secondary"
            >
              {updating ? "Ending..." : "End Session"}
            </button>
          </>
        ) : !isTerminal ? (
          <button
            type="button"
            onClick={advanceStatus}
            disabled={updating}
            className="btn-secondary"
          >
            {updating ? "Updating..." : `Advance to ${nextLabel ?? "—"}`}
          </button>
        ) : (
          <span className="badge-green text-sm">Session Complete</span>
        )}

        <a
          href={`/admin/sessions/${session.id}`}
          className="text-xs text-brand-vivid hover:opacity-80 ml-auto"
        >
          Full admin view →
        </a>
      </div>

      {advanceError && <FormError message={advanceError} />}
    </div>
  );
}
