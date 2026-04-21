"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/supabase-provider";

/**
 * Site-wide "Session started — head to your court" modal.
 *
 * Mounted once in the authenticated layout so it shows no matter
 * where the viewer is in the app. Its job is to be a fallback for
 * people who don't have push notifications on — if you're on the
 * dashboard / groups page / anywhere when the admin starts your
 * session, this blocks the UI until you acknowledge (or go straight
 * to the Play tab).
 *
 * Coordination with the Play-tab's own Session-Started modal: both
 * use the same localStorage key (`session-started-ack:<sessionId>`)
 * for the ack, AND this global one suppresses itself when the viewer
 * is already on /sessions/<thatId> so they don't both pop.
 */
export function ActiveSessionAlert({ profileId }: { profileId: string }) {
  const { supabase } = useSupabase();
  const pathname = usePathname();

  const [active, setActive] = useState<{
    id: string;
    groupName: string;
    courtNumber: number | null;
  } | null>(null);

  const isAcked = useCallback((sessionId: string) => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(`session-started-ack:${sessionId}`) === "1";
  }, []);

  const setAcked = useCallback((sessionId: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`session-started-ack:${sessionId}`, "1");
  }, []);

  const checkForActive = useCallback(async () => {
    // Find a session where the viewer is checked in AND the session
    // has just gone round_active. We fetch all checked-in rows for
    // this player and let the inner join filter server-side — keeps
    // the query small even when the player has a long history.
    const { data } = await supabase
      .from("session_participants")
      .select(
        `court_number,
         session:shootout_sessions!inner(
           id, status, group_id,
           group:shootout_groups(name)
         )`
      )
      .eq("player_id", profileId)
      .eq("checked_in", true)
      .eq("session.status", "round_active");

    // PostgREST returns nested embeds as arrays/objects depending on
    // the relationship shape, and its generated types don't narrow the
    // !inner filter back to a single object. Loose-typed walk here is
    // fine — this is a display-only component.
    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const s = row.session as
        | {
            id: string;
            status: string;
            group_id: string;
            group: { name?: string } | null;
          }
        | undefined;
      if (!s || s.status !== "round_active") continue;
      if (isAcked(s.id)) continue;
      setActive({
        id: s.id,
        groupName: s.group?.name ?? "your session",
        courtNumber: (row.court_number as number | null) ?? null,
      });
      return;
    }
    setActive(null);
  }, [supabase, profileId, isAcked]);

  // Initial check on mount + any time the viewer changes route (so a
  // fresh nav also re-evaluates, cheap because the query is small).
  useEffect(() => {
    checkForActive();
  }, [checkForActive, pathname]);

  // Realtime: any UPDATE on shootout_sessions might be the status
  // flipping to round_active. RLS restricts incoming events to groups
  // the viewer is in, so this stays cheap at rest.
  useEffect(() => {
    const ch = supabase
      .channel(`active-session-alert-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shootout_sessions",
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

  // Visibility refresh — if the phone backgrounded during the
  // transition and the Realtime channel dropped, we pick it up on
  // refocus so the modal still fires.
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

  // Suppress when the viewer is already on the Play tab for this
  // same session — the Play-tab modal handles that case with richer
  // UI (hero card, etc.) and the two would overlap otherwise.
  if (pathname === `/sessions/${active.id}`) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-session-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in p-6 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
            <path d="M10 3.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM1.25 10a8.75 8.75 0 1 1 17.5 0 8.75 8.75 0 0 1-17.5 0Zm9.75-3a1 1 0 1 0-2 0v3.5a1 1 0 0 0 .55.9l2.5 1.25a1 1 0 0 0 .9-1.8L11 10.38V7Z" />
          </svg>
        </div>
        <div>
          <h2 id="active-session-title" className="text-lg font-semibold text-dark-100">
            Session Started
          </h2>
          <p className="mt-1 text-xs text-surface-muted">{active.groupName}</p>
          {active.courtNumber != null ? (
            <>
              <p className="mt-2 text-sm text-surface-muted">You&apos;re on</p>
              <p className="mt-1 text-3xl font-bold text-brand-vivid">
                Court {active.courtNumber}
              </p>
              <p className="mt-2 text-sm text-surface-muted">
                Head there now to start playing.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-surface-muted">
              The round is live. Tap below to see your court.
            </p>
          )}
        </div>
        <Link
          href={`/sessions/${active.id}`}
          onClick={() => {
            setAcked(active.id);
            setActive(null);
          }}
          className="btn-primary w-full block"
        >
          Go to session
        </Link>
        <button
          type="button"
          onClick={() => {
            setAcked(active.id);
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
