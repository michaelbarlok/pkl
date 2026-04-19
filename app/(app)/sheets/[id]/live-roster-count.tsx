"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";

/**
 * Live confirmed / waitlist counts for a sheet.
 *
 * Why this doesn't throttle signups under load:
 *
 *  - Supabase Realtime runs over its own WebSocket pool, completely
 *    separate from the HTTP pool that services the signup RPC. Opening
 *    a subscription here doesn't consume a connection that a signup
 *    needs.
 *
 *  - Events are applied to LOCAL state only. No extra HTTP round-trip
 *    fires per event, so a 40-person signup burst doesn't cause every
 *    watching client to fan out to the API.
 *
 *  - We derive count deltas from the event's `old` + `new` payload
 *    (INSERT / UPDATE / DELETE), so a high-priority bump that flips a
 *    confirmed → waitlist is reflected correctly without a refetch.
 */

interface Props {
  sheetId: string;
  initialConfirmed: number;
  initialWaitlist: number;
  playerLimit: number;
}

type RegistrationStatus = "confirmed" | "waitlist" | "withdrawn";

interface RegistrationRow {
  status?: RegistrationStatus;
}

export function LiveRosterCount({
  sheetId,
  initialConfirmed,
  initialWaitlist,
  playerLimit,
}: Props) {
  const { supabase } = useSupabase();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [waitlist, setWaitlist] = useState(initialWaitlist);
  const [justUpdated, setJustUpdated] = useState(false);

  // If the server-rendered initial values change (e.g. after a
  // router.refresh()), snap local state back to them. This protects
  // against drift if the subscription ever dropped an event.
  useEffect(() => {
    setConfirmed(initialConfirmed);
    setWaitlist(initialWaitlist);
  }, [initialConfirmed, initialWaitlist]);

  useEffect(() => {
    let flashTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Apply one change event to local state. Status transitions:
     *   new confirmed        → confirmed++
     *   new waitlist         → waitlist++
     *   confirmed → waitlist → confirmed-- waitlist++ (priority bump)
     *   waitlist  → confirmed → confirmed++ waitlist-- (promotion)
     *   confirmed → withdrawn→ confirmed--
     *   waitlist  → withdrawn→ waitlist--
     */
    function applyDelta(oldRow: RegistrationRow | null, newRow: RegistrationRow | null) {
      const oldStatus = oldRow?.status;
      const newStatus = newRow?.status;
      if (oldStatus === newStatus) return;

      let confirmedDelta = 0;
      let waitlistDelta = 0;

      if (oldStatus === "confirmed") confirmedDelta--;
      else if (oldStatus === "waitlist") waitlistDelta--;

      if (newStatus === "confirmed") confirmedDelta++;
      else if (newStatus === "waitlist") waitlistDelta++;

      if (confirmedDelta === 0 && waitlistDelta === 0) return;

      if (confirmedDelta !== 0) {
        setConfirmed((c) => Math.max(0, c + confirmedDelta));
      }
      if (waitlistDelta !== 0) {
        setWaitlist((w) => Math.max(0, w + waitlistDelta));
      }

      // Brief visual flash on any real change.
      setJustUpdated(true);
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setJustUpdated(false), 700);
    }

    const channel = supabase
      .channel(`roster-count-${sheetId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "registrations", filter: `sheet_id=eq.${sheetId}` },
        (payload) => applyDelta(null, payload.new as RegistrationRow)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "registrations", filter: `sheet_id=eq.${sheetId}` },
        (payload) => applyDelta(payload.old as RegistrationRow, payload.new as RegistrationRow)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "registrations", filter: `sheet_id=eq.${sheetId}` },
        (payload) => applyDelta(payload.old as RegistrationRow, null)
      )
      .subscribe();

    return () => {
      if (flashTimer) clearTimeout(flashTimer);
      supabase.removeChannel(channel);
    };
  }, [sheetId, supabase]);

  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-surface-muted">
        Players
      </dt>
      <dd
        className={`mt-0.5 truncate flex items-center gap-1.5 transition-colors ${
          justUpdated ? "text-teal-300" : "text-dark-100"
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-400" />
          </span>
          <span>
            {confirmed}/{playerLimit}
            {waitlist > 0 && (
              <span className="text-surface-muted"> (+{waitlist} wait)</span>
            )}
          </span>
        </span>
      </dd>
    </div>
  );
}
