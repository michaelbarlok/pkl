"use client";

import { getDivisionLabel } from "@/lib/divisions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CollapsibleCard } from "./collapsible-card";

interface CourtRange {
  id?: string;
  label: string;
  court_start: number;
  court_end: number;
  divisions: string[];
}

interface Props {
  tournamentId: string;
  numCourts: number;
  /** Every division code the tournament has registrations for —
   *  passed in by the page so we don't surface a checkbox for an
   *  empty division. */
  availableDivisions: string[];
  initialRanges: CourtRange[];
}

/**
 * Optional layout step for large multi-side tournaments. The
 * organizer carves the tournament's total court count into one or
 * more ranges and assigns specific divisions to each range, so
 * matches in those divisions only land on those courts. Skipping
 * this entirely (no rows) keeps the existing behavior — every
 * division on every court.
 */
export function CourtRangesPanel({
  tournamentId,
  numCourts,
  availableDivisions,
  initialRanges,
}: Props) {
  const router = useRouter();
  const [ranges, setRanges] = useState<CourtRange[]>(initialRanges);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function addRange() {
    // Default the new range to whatever bare strip is left over
    // (numCourts minus the union of existing ranges). Falls back to
    // the very first court if everything's covered already so the
    // organizer at least gets editable inputs.
    const used = new Set<number>();
    for (const r of ranges) {
      for (let c = r.court_start; c <= r.court_end; c++) used.add(c);
    }
    let start = 1;
    while (start <= numCourts && used.has(start)) start++;
    let end = start;
    while (end < numCourts && !used.has(end + 1)) end++;
    if (start > numCourts) {
      start = 1;
      end = Math.min(numCourts, 1);
    }
    setRanges((prev) => [
      ...prev,
      {
        label: `Range ${prev.length + 1}`,
        court_start: start,
        court_end: end,
        divisions: [],
      },
    ]);
  }

  function updateRange(idx: number, patch: Partial<CourtRange>) {
    setRanges((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRange(idx: number) {
    setRanges((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleDivision(idx: number, division: string) {
    setRanges((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const has = r.divisions.includes(division);
        return {
          ...r,
          divisions: has
            ? r.divisions.filter((d) => d !== division)
            : [...r.divisions, division],
        };
      })
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/court-ranges`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ranges: ranges.map((r) => ({
          label: r.label,
          court_start: r.court_start,
          court_end: r.court_end,
          divisions: r.divisions,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save ranges");
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  // Live validation snapshot — same rules as the API, mirrored client
  // side so the organizer sees the problem before submitting. Any
  // hit here disables the Save button.
  const validationErrors: string[] = [];
  const courtOwner = new Map<number, number>();
  const divOwner = new Map<string, number>();
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.court_start < 1 || r.court_end < r.court_start) {
      validationErrors.push(
        `Range ${i + 1}: court_start must be ≥ 1 and court_end ≥ court_start.`
      );
    }
    if (r.court_end > numCourts) {
      validationErrors.push(
        `Range ${i + 1}: court ${r.court_end} is past the tournament's ${numCourts} total courts.`
      );
    }
    for (let c = r.court_start; c <= r.court_end; c++) {
      const owner = courtOwner.get(c);
      if (owner != null && owner !== i + 1) {
        validationErrors.push(
          `Court ${c} is in both range ${owner} and range ${i + 1}.`
        );
      }
      courtOwner.set(c, i + 1);
    }
    for (const d of r.divisions) {
      const owner = divOwner.get(d);
      if (owner != null && owner !== i + 1) {
        validationErrors.push(
          `Division "${getDivisionLabel(d)}" is in both range ${owner} and range ${i + 1}.`
        );
      }
      divOwner.set(d, i + 1);
    }
  }
  const dedupedErrors = Array.from(new Set(validationErrors));

  // Subtitle gives a one-glance summary so the organizer doesn't
  // have to expand the card to know whether ranges are configured
  // and whether the layout is currently saved.
  const subtitle =
    initialRanges.length === 0 && ranges.length === 0
      ? "Optional — every division on every court"
      : `${ranges.length} range${ranges.length === 1 ? "" : "s"} configured`;

  return (
    <CollapsibleCard
      title="Court ranges"
      subtitle={subtitle}
      defaultOpen={initialRanges.length > 0}
    >
      <p className="text-xs text-surface-muted mb-3">
        Carve the tournament's {numCourts} courts into ranges and pin
        divisions to each. Matches in those divisions will only queue
        for courts inside their range. Leave this empty for the
        default — any division on any court.
      </p>

      {ranges.length === 0 ? (
        <p className="text-xs text-surface-muted italic mb-3">
          No ranges defined. Click "Add range" to start.
        </p>
      ) : (
        <div className="space-y-3 mb-3">
          {ranges.map((r, i) => (
            <div
              key={i}
              className="rounded-lg border border-surface-border bg-surface-overlay px-3 py-3 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={r.label}
                  onChange={(e) => updateRange(i, { label: e.target.value })}
                  className="input text-sm font-semibold flex-1"
                  placeholder={`Range ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeRange(i)}
                  className="btn-secondary text-xs !text-red-400 !border-red-500/40 hover:!bg-red-900/20"
                >
                  Remove
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-dark-200">Courts</label>
                <input
                  type="number"
                  min={1}
                  max={numCourts}
                  value={r.court_start}
                  onChange={(e) =>
                    updateRange(i, { court_start: parseInt(e.target.value) || 1 })
                  }
                  className="input w-20 py-1 text-center text-sm"
                />
                <span className="text-xs text-surface-muted">to</span>
                <input
                  type="number"
                  min={r.court_start}
                  max={numCourts}
                  value={r.court_end}
                  onChange={(e) =>
                    updateRange(i, { court_end: parseInt(e.target.value) || r.court_start })
                  }
                  className="input w-20 py-1 text-center text-sm"
                />
                <span className="text-xs text-surface-muted">
                  ({r.court_end - r.court_start + 1} court{r.court_end - r.court_start === 0 ? "" : "s"})
                </span>
              </div>
              <div>
                <p className="text-xs text-dark-200 mb-1.5">Divisions on these courts</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableDivisions.length === 0 ? (
                    <span className="text-xs text-surface-muted">No divisions yet.</span>
                  ) : (
                    availableDivisions.map((d) => {
                      const checked = r.divisions.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDivision(i, d)}
                          className={
                            "text-[11px] px-2 py-1 rounded-full transition-colors " +
                            (checked
                              ? "bg-brand-500 text-white ring-1 ring-brand-400"
                              : "bg-surface-raised text-surface-muted ring-1 ring-surface-border hover:text-dark-200")
                          }
                        >
                          {getDivisionLabel(d)}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={addRange} className="btn-secondary text-xs">
          Add range
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || dedupedErrors.length > 0}
          className="btn-primary text-xs disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save ranges"}
        </button>
        {ranges.length > 0 && (
          <button
            type="button"
            onClick={() => setRanges([])}
            disabled={saving}
            className="btn-secondary text-xs"
            title="Clear all ranges (queue reverts to the default — every division on every court)"
          >
            Clear all
          </button>
        )}
        {savedAt != null && error == null && (
          <span className="text-[11px] text-brand-vivid">Saved.</span>
        )}
      </div>

      {dedupedErrors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-400 list-disc list-inside">
          {dedupedErrors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </CollapsibleCard>
  );
}
