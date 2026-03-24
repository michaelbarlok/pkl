"use client";

import { FormError } from "@/components/form-error";
import { getDivisionLabel } from "@/lib/divisions";
import { getPoolStructure } from "@/lib/tournament-bracket";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface DivisionCount {
  division: string;
  count: number;
  playerNames: string[];
}

interface Props {
  tournamentId: string;
  divisions: DivisionCount[];
  format?: string;
}

export function DivisionReview({ tournamentId, divisions: initialDivisions, format }: Props) {
  const router = useRouter();
  const [divisions, setDivisions] = useState(initialDivisions);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  // Per-division pool rounds: { divisionCode: roundsValue }
  const [poolRounds, setPoolRounds] = useState<Record<string, string>>({});

  const isRoundRobin = format === "round_robin";
  const MIN_PLAYERS = isRoundRobin ? 3 : 4;

  function toggleMergeSelect(div: string) {
    setSelectedForMerge((prev) =>
      prev.includes(div) ? prev.filter((d) => d !== div) : [...prev, div]
    );
  }

  async function handleMerge() {
    if (selectedForMerge.length < 2) return;
    setMerging(true);
    setError("");

    // Target division is the first selected one
    const target = selectedForMerge[0];
    const sources = selectedForMerge.slice(1);

    const res = await fetch(`/api/tournaments/${tournamentId}/divisions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge", target, sources }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Merge failed");
      setMerging(false);
      return;
    }

    // Update local state: merge counts into target
    const mergedCount = selectedForMerge.reduce(
      (sum, d) => sum + (divisions.find((x) => x.division === d)?.count ?? 0),
      0
    );
    const mergedNames = selectedForMerge.flatMap(
      (d) => divisions.find((x) => x.division === d)?.playerNames ?? []
    );

    setDivisions((prev) => {
      const updated = prev
        .filter((d) => !sources.includes(d.division))
        .map((d) =>
          d.division === target
            ? { ...d, count: mergedCount, playerNames: mergedNames }
            : d
        );
      return updated;
    });
    setSelectedForMerge([]);
    setMerging(false);
  }

  async function handleCancel(division: string) {
    setError("");

    const res = await fetch(`/api/tournaments/${tournamentId}/divisions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", division }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Cancel failed");
      return;
    }

    setDivisions((prev) => prev.filter((d) => d.division !== division));
    setSelectedForMerge((prev) => prev.filter((d) => d !== division));
  }

  async function handleGenerate() {
    // Check all remaining divisions have enough players
    const tooSmall = divisions.filter((d) => d.count < MIN_PLAYERS);
    if (tooSmall.length > 0) {
      setError(
        `These divisions have fewer than ${MIN_PLAYERS} players: ${tooSmall
          .map((d) => getDivisionLabel(d.division))
          .join(", ")}. Merge or cancel them first.`
      );
      return;
    }

    setGenerating(true);
    setError("");

    // Build division_settings from pool rounds configuration
    const divisionSettings: Record<string, { pool_rounds: number }> = {};
    if (isRoundRobin) {
      for (const d of divisions) {
        const val = parseInt(poolRounds[d.division] ?? "");
        if (val > 0) {
          divisionSettings[d.division] = { pool_rounds: val };
        }
      }
    }

    const res = await fetch(`/api/tournaments/${tournamentId}/divisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", division_settings: divisionSettings }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Bracket generation failed");
      setGenerating(false);
      return;
    }

    router.refresh();
  }

  const hasSmallDivisions = divisions.some((d) => d.count < MIN_PLAYERS);

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-dark-200 mb-1">Division Review</h2>
        <p className="text-xs text-surface-muted">
          Review player counts per division before generating brackets. Each division
          needs at least {MIN_PLAYERS} players. You can merge or cancel divisions as needed.
        </p>
      </div>

      {/* Division list */}
      <div className="space-y-2">
        {divisions.map((d) => {
          const isSmall = d.count < MIN_PLAYERS;
          const isSelected = selectedForMerge.includes(d.division);
          const poolStructure = isRoundRobin ? getPoolStructure(d.count) : null;

          return (
            <div key={d.division} className="space-y-0">
              <div
                className={`rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-900/20"
                    : isSmall
                    ? "border-red-500/40 bg-red-900/10"
                    : "border-surface-border bg-surface-raised"
                } ${isRoundRobin && !isSmall ? "rounded-b-none" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleMergeSelect(d.division)}
                    className="rounded border-surface-border text-brand-500 focus:ring-brand-500 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-dark-100 truncate">
                      {getDivisionLabel(d.division)}
                    </p>
                    <p className="text-xs text-surface-muted truncate">
                      {d.playerNames.slice(0, 4).join(", ")}
                      {d.playerNames.length > 4 && ` +${d.playerNames.length - 4} more`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-sm font-semibold ${
                      isSmall ? "text-red-400" : "text-teal-300"
                    }`}
                  >
                    {d.count} player{d.count !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => handleCancel(d.division)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium ml-1"
                    title="Cancel this division"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Pool rounds configuration for round robin */}
              {isRoundRobin && poolStructure && !isSmall && (
                <div className="rounded-b-lg border border-t-0 border-surface-border bg-surface-overlay px-3 py-2.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-surface-muted">
                      {poolStructure.numPools === 1
                        ? "1 pool"
                        : `${poolStructure.numPools} pools (${poolStructure.poolSizes.join(", ")} teams)`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-medium text-dark-200">
                        Rounds:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={poolStructure.maxRoundsPerPool}
                        value={poolRounds[d.division] ?? String(poolStructure.maxRoundsPerPool)}
                        onChange={(e) =>
                          setPoolRounds((prev) => ({ ...prev, [d.division]: e.target.value }))
                        }
                        className="input w-16 py-1 text-center text-xs"
                      />
                      <span className="text-xs text-surface-muted">
                        (max {poolStructure.maxRoundsPerPool})
                      </span>
                    </div>
                    {poolStructure.numPools >= 3 && (
                      <span className="text-xs text-brand-300">
                        Top 2 per pool advance to bracket
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Merge controls */}
      {selectedForMerge.length >= 2 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-brand-900/20 border border-brand-500/30">
          <p className="text-xs text-brand-300 flex-1">
            Merge {selectedForMerge.length} selected divisions into &quot;{getDivisionLabel(selectedForMerge[0])}&quot;
          </p>
          <button
            onClick={handleMerge}
            disabled={merging}
            className="btn-primary text-xs py-1 px-3"
          >
            {merging ? "Merging..." : "Merge"}
          </button>
        </div>
      )}

      <FormError message={error} />

      {/* Generate button */}
      <div className="pt-2 border-t border-surface-border flex flex-wrap gap-2">
        <button
          onClick={handleGenerate}
          disabled={generating || divisions.length === 0}
          className="btn-primary"
        >
          {generating
            ? "Generating Brackets..."
            : `Generate Brackets (${divisions.length} division${divisions.length !== 1 ? "s" : ""})`}
        </button>
        {hasSmallDivisions && (
          <p className="text-xs text-red-400 self-center">
            Some divisions have fewer than {MIN_PLAYERS} players
          </p>
        )}
      </div>
    </div>
  );
}
