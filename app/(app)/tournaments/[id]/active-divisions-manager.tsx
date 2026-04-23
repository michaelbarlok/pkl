"use client";

import { getDivisionLabel } from "@/lib/divisions";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
 * Organizer panel shown once the tournament is in_progress. Lets the
 * organizer flip individual divisions to "active" (or all at once),
 * which broadcasts a notification to that division's registrants and
 * primes the court-assignment queue. The per-division Active pill
 * also becomes a Deactivate action.
 */
export function ActiveDivisionsManager({
  tournamentId,
  numCourts,
  divisions,
  initialActive,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<Set<string>>(new Set(initialActive));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function activate(divisions: string[], all = false) {
    if (divisions.length === 0 && !all) return;
    setBusy(all ? "__all__" : divisions[0]);
    setError("");
    const res = await fetch(`/api/tournaments/${tournamentId}/active-divisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { divisions }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "Could not activate division");
      return;
    }
    const newActive = new Set(active);
    for (const d of data.newly_activated ?? []) newActive.add(d);
    for (const d of data.already_active ?? []) newActive.add(d);
    setActive(newActive);
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

  const inactiveDivisions = divisions.filter((d) => !active.has(d.division));
  const allAreActive = inactiveDivisions.length === 0 && divisions.length > 0;

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-dark-200">Live Divisions</h2>
          <p className="text-xs text-surface-muted mt-0.5">
            Activating a division notifies its registrants and starts assigning matches to courts.
            {numCourts
              ? ` You have ${numCourts} court${numCourts === 1 ? "" : "s"} configured.`
              : " Set a court count on the tournament edit page before activating."}
          </p>
        </div>
        {!allAreActive && (
          <button
            type="button"
            onClick={() => activate([], true)}
            disabled={busy !== null || numCourts === null}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50 whitespace-nowrap"
          >
            {busy === "__all__" ? "Activating…" : "Activate All"}
          </button>
        )}
      </div>

      <ul className="space-y-1.5">
        {divisions.map((d) => {
          const isActive = active.has(d.division);
          const thisBusy = busy === d.division;
          return (
            <li
              key={d.division}
              className="flex items-center justify-between gap-3 rounded-md bg-surface-overlay px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs">
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
              </div>
              {isActive ? (
                <button
                  type="button"
                  onClick={() => deactivate(d.division)}
                  disabled={thisBusy}
                  className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50"
                >
                  {thisBusy ? "…" : "Deactivate"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => activate([d.division])}
                  disabled={busy !== null || numCourts === null}
                  className="btn-primary text-xs py-1 px-2.5 disabled:opacity-50"
                >
                  {thisBusy ? "Activating…" : "Activate"}
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
