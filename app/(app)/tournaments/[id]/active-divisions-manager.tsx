"use client";

import { getDivisionLabel } from "@/lib/divisions";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface DivisionCount {
  division: string;
  count: number;
}

interface Props {
  tournamentId: string;
  numCourts: number | null;
  divisions: DivisionCount[];
  initialActive: string[];
}

/**
 * Organizer panel shown once the tournament is in_progress. The
 * organizer ticks off which divisions to flip live and hits
 * "Activate Selected" — one round-trip flips the checked rows,
 * broadcasts notifications, and primes the court queue with a
 * randomized division interleave so each division gets a court in
 * the first batch instead of one division hogging everything.
 *
 * Live rows get a Deactivate action next to the pill; the checkbox
 * is disabled on those because they're already on.
 */
export function ActiveDivisionsManager({
  tournamentId,
  numCourts,
  divisions,
  initialActive,
}: Props) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [active, setActive] = useState<Set<string>>(new Set(initialActive));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Mirror tournament_active_divisions into local state so co-organizers
  // operating from another device see the live status without refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`active-divs-mgr-${tournamentId}`)
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

  const inactiveDivisions = useMemo(
    () => divisions.filter((d) => !active.has(d.division)),
    [divisions, active]
  );
  const allAreActive = inactiveDivisions.length === 0 && divisions.length > 0;

  function toggleSelected(division: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(division)) next.delete(division);
      else next.add(division);
      return next;
    });
  }

  async function activate(divisionList: string[], all = false) {
    if (divisionList.length === 0 && !all) return;
    setBusy(all ? "__all__" : "__selected__");
    setError("");
    const res = await fetch(`/api/tournaments/${tournamentId}/active-divisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { divisions: divisionList }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Could not activate divisions");
      return;
    }
    const newActive = new Set(active);
    for (const d of data.newly_activated ?? []) newActive.add(d);
    for (const d of data.already_active ?? []) newActive.add(d);
    setActive(newActive);
    setSelected(new Set());
    router.refresh();
  }

  async function deactivate(division: string) {
    setBusy(division);
    setError("");
    const res = await fetch(
      `/api/tournaments/${tournamentId}/active-divisions?division=${encodeURIComponent(division)}`,
      { method: "DELETE" }
    );
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not deactivate division");
      return;
    }
    const newActive = new Set(active);
    newActive.delete(division);
    setActive(newActive);
    router.refresh();
  }

  const selectedCount = selected.size;

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-dark-200">Live Divisions</h2>
          <p className="text-xs text-surface-muted mt-0.5">
            Check the divisions you want live, then Activate Selected. Players in
            those divisions get a push; their round-1 matches interleave across
            divisions so each one gets court time in the first batch.
            {numCourts
              ? ` You have ${numCourts} court${numCourts === 1 ? "" : "s"} configured.`
              : " Set a court count on the tournament edit page before activating."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => activate(Array.from(selected))}
            disabled={
              busy !== null ||
              numCourts === null ||
              selectedCount === 0
            }
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 whitespace-nowrap"
          >
            {busy === "__selected__"
              ? "Activating…"
              : `Activate Selected${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
          {!allAreActive && (
            <button
              type="button"
              onClick={() => activate([], true)}
              disabled={busy !== null || numCourts === null}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "__all__" ? "Activating…" : "Activate All"}
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-1.5">
        {divisions.map((d) => {
          const isActive = active.has(d.division);
          const thisBusy = busy === d.division;
          const isSelected = selected.has(d.division);
          return (
            <li
              key={d.division}
              className="flex items-center justify-between gap-3 rounded-md bg-surface-overlay px-3 py-2"
            >
              <label className="flex items-center gap-2 text-xs cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={isActive || isSelected}
                  disabled={isActive || busy !== null || numCourts === null}
                  onChange={() => toggleSelected(d.division)}
                  className="rounded border-surface-border text-brand-500 focus:ring-brand-500 disabled:opacity-50"
                />
                <span className="text-dark-100 font-medium">
                  {getDivisionLabel(d.division)}
                </span>
                <span className="text-surface-muted">
                  ({d.count} {d.count === 1 ? "team" : "teams"})
                </span>
                {isActive && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-500/15 text-brand-vivid ring-1 ring-brand-500/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-vivid animate-pulse" />
                    Live
                  </span>
                )}
              </label>
              {isActive && (
                <button
                  type="button"
                  onClick={() => deactivate(d.division)}
                  disabled={thisBusy}
                  className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50"
                >
                  {thisBusy ? "…" : "Deactivate"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
