"use client";

import { FormError } from "@/components/form-error";
import { getDivision, getDivisionLabel, SKILLS } from "@/lib/divisions";
import {
  getPoolStructure,
  isValidGamesPerTeam,
  poolGamesInfo,
} from "@/lib/tournament-bracket";
import { useRouter } from "next/navigation";
import { useState } from "react";

function describePoolSplit(structure: { numPools: number; poolSizes: number[] }): string {
  const { numPools, poolSizes } = structure;
  const unique = [...new Set(poolSizes)];
  if (unique.length === 1) {
    return `${numPools} pool${numPools > 1 ? "s" : ""} of ${unique[0]} team${unique[0] > 1 ? "s" : ""}`;
  }
  return `${numPools} pools (${poolSizes.join(", ")} teams)`;
}

interface DivisionCount {
  division: string;
  count: number;
  playerNames: string[];
}

interface SeedPlayer {
  id: string;
  player_id: string;
  display_name: string;
  seed: number | null;
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
  const [gamesPerTeam, setGamesPerTeam] = useState<Record<string, string>>({});
  const [numPoolsOverride, setNumPoolsOverride] = useState<Record<string, string>>({});
  const [playoffAdvancing, setPlayoffAdvancing] = useState<Record<string, string>>({});
  // Per-division score-to-win overrides. Pool and playoff are
  // independent — organizers commonly want pool play to 11 (more
  // games, shorter each) but playoffs to 15 (fewer matches, more
  // weight). Empty string = fall back to tournament-level default.
  const [scoreToWinPool, setScoreToWinPool] = useState<Record<string, string>>({});
  const [scoreToWinPlayoff, setScoreToWinPlayoff] = useState<Record<string, string>>({});

  // Seeding state
  const [seedingOpen, setSeedingOpen] = useState<Record<string, boolean>>({});
  const [seedPlayers, setSeedPlayers] = useState<Record<string, SeedPlayer[]>>({});
  const [loadingSeeds, setLoadingSeeds] = useState<Record<string, boolean>>({});
  const [savingSeeds, setSavingSeeds] = useState<Record<string, boolean>>({});
  const [savedSeeds, setSavedSeeds] = useState<Record<string, boolean>>({});
  const [seedError, setSeedError] = useState<Record<string, string>>({});

  const isRoundRobin = format === "round_robin";
  const MIN_PLAYERS = isRoundRobin ? 3 : 4;

  // ── Merge / Cancel ────────────────────────────────────────────

  function toggleMergeSelect(div: string) {
    setSelectedForMerge((prev) =>
      prev.includes(div) ? prev.filter((d) => d !== div) : [...prev, div]
    );
  }

  async function handleMerge() {
    if (selectedForMerge.length < 2) return;
    setMerging(true);
    setError("");

    const skillRank = (code: string) =>
      SKILLS.findIndex((s) => s.value === getDivision(code)?.skill);
    const target = [...selectedForMerge].sort((a, b) => skillRank(b) - skillRank(a))[0];
    const sources = selectedForMerge.filter((d) => d !== target);

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
    // Invalidate seed cache for the target so it reloads the full merged player list
    setSeedPlayers((prev) => {
      const updated = { ...prev };
      delete updated[target];
      return updated;
    });
    setSeedingOpen((prev) => ({ ...prev, [target]: false }));
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

  // ── Bracket generation ────────────────────────────────────────

  async function handleGenerate() {
    const tooSmall = divisions.filter((d) => d.count < MIN_PLAYERS);
    if (tooSmall.length > 0) {
      setError(
        `These divisions have fewer than ${MIN_PLAYERS} players: ${tooSmall
          .map((d) => getDivisionLabel(d.division))
          .join(", ")}. Merge or cancel them first.`
      );
      return;
    }

    // Block unschedulable games-per-team choices before we hit the
    // server. The same check runs in the pool panel renderer to show
    // the inline error, so the user has already seen the reason.
    const invalidLabels: string[] = [];
    if (isRoundRobin) {
      for (const d of divisions) {
        const gpt = parseInt(gamesPerTeam[d.division] ?? "");
        if (!gpt || gpt <= 0) continue;
        const poolOverride = parseInt(numPoolsOverride[d.division] ?? "") || undefined;
        const structure = getPoolStructure(d.count, { numPools: poolOverride });
        if (structure.poolSizes.some((s) => !isValidGamesPerTeam(s, gpt))) {
          invalidLabels.push(getDivisionLabel(d.division));
        }
      }
    }
    if (invalidLabels.length > 0) {
      setError(
        `Pick a valid "Games per team" for: ${invalidLabels.join(", ")}. Odd-sized pools need whole-lap multiples (see the hint under the input).`
      );
      return;
    }

    setGenerating(true);
    setError("");

    const divisionSettings: Record<
      string,
      {
        games_per_team?: number;
        num_pools?: number;
        playoff_advancing?: number;
        score_to_win_pool?: number;
        score_to_win_playoff?: number;
      }
    > = {};
    if (isRoundRobin) {
      for (const d of divisions) {
        const settings: {
          games_per_team?: number;
          num_pools?: number;
          playoff_advancing?: number;
          score_to_win_pool?: number;
          score_to_win_playoff?: number;
        } = {};
        const gpt = parseInt(gamesPerTeam[d.division] ?? "");
        if (gpt > 0) settings.games_per_team = gpt;
        const np = parseInt(numPoolsOverride[d.division] ?? "");
        if (np > 0) settings.num_pools = np;
        const pa = parseInt(playoffAdvancing[d.division] ?? "");
        if (pa > 0) settings.playoff_advancing = pa;
        const stwPool = parseInt(scoreToWinPool[d.division] ?? "");
        if (stwPool > 0) settings.score_to_win_pool = stwPool;
        const stwPlayoff = parseInt(scoreToWinPlayoff[d.division] ?? "");
        if (stwPlayoff > 0) settings.score_to_win_playoff = stwPlayoff;
        if (Object.keys(settings).length > 0) {
          divisionSettings[d.division] = settings;
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

  // ── Seeding ───────────────────────────────────────────────────

  async function toggleSeedPanel(division: string) {
    const isOpen = seedingOpen[division];
    setSeedingOpen((prev) => ({ ...prev, [division]: !isOpen }));

    if (!isOpen && !seedPlayers[division]) {
      setLoadingSeeds((prev) => ({ ...prev, [division]: true }));
      setSeedError((prev) => ({ ...prev, [division]: "" }));
      try {
        const res = await fetch(
          `/api/tournaments/${tournamentId}/seeds?division=${encodeURIComponent(division)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSeedPlayers((prev) => ({ ...prev, [division]: data }));
        } else {
          const data = await res.json();
          setSeedError((prev) => ({ ...prev, [division]: data.error ?? "Failed to load players" }));
        }
      } finally {
        setLoadingSeeds((prev) => ({ ...prev, [division]: false }));
      }
    }
  }

  function moveSeedPlayer(division: string, fromIndex: number, toIndex: number) {
    setSeedPlayers((prev) => {
      const arr = [...prev[division]];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return { ...prev, [division]: arr };
    });
    setSavedSeeds((prev) => ({ ...prev, [division]: false }));
  }

  function randomizeSeedOrder(division: string) {
    setSeedPlayers((prev) => {
      const arr = [...prev[division]];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return { ...prev, [division]: arr };
    });
    setSavedSeeds((prev) => ({ ...prev, [division]: false }));
  }

  async function clearSeeds(division: string) {
    setSavingSeeds((prev) => ({ ...prev, [division]: true }));
    try {
      await fetch(
        `/api/tournaments/${tournamentId}/seeds?division=${encodeURIComponent(division)}`,
        { method: "DELETE" }
      );
      // Reload players (now all unseeded, sorted by registration date)
      const res = await fetch(
        `/api/tournaments/${tournamentId}/seeds?division=${encodeURIComponent(division)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSeedPlayers((prev) => ({ ...prev, [division]: data }));
      }
      setSavedSeeds((prev) => ({ ...prev, [division]: false }));
    } finally {
      setSavingSeeds((prev) => ({ ...prev, [division]: false }));
    }
  }

  async function saveSeedOrder(division: string) {
    setSavingSeeds((prev) => ({ ...prev, [division]: true }));
    setSavedSeeds((prev) => ({ ...prev, [division]: false }));
    setSeedError((prev) => ({ ...prev, [division]: "" }));
    try {
      const order = seedPlayers[division].map((p) => p.player_id);
      const res = await fetch(`/api/tournaments/${tournamentId}/seeds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ division, order }),
      });
      if (res.ok) {
        setSavedSeeds((prev) => ({ ...prev, [division]: true }));
      } else {
        const data = await res.json();
        setSeedError((prev) => ({ ...prev, [division]: data.error ?? "Save failed" }));
      }
    } finally {
      setSavingSeeds((prev) => ({ ...prev, [division]: false }));
    }
  }

  // ─────────────────────────────────────────────────────────────

  const hasSmallDivisions = divisions.some((d) => d.count < MIN_PLAYERS);

  // Compute which divisions have an unschedulable gamesPerTeam value
  // for at least one of their pools — used to gate the Generate
  // button and surface an inline error under the offending input.
  const divisionsWithInvalidGames = new Set<string>();
  if (isRoundRobin) {
    for (const d of divisions) {
      const raw = gamesPerTeam[d.division];
      const gpt = parseInt(raw ?? "");
      if (!gpt || gpt <= 0) continue;
      const poolOverride = parseInt(numPoolsOverride[d.division] ?? "") || undefined;
      const structure = getPoolStructure(d.count, { numPools: poolOverride });
      for (const size of structure.poolSizes) {
        if (!isValidGamesPerTeam(size, gpt)) {
          divisionsWithInvalidGames.add(d.division);
          break;
        }
      }
    }
  }

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
          const isSeedOpen = seedingOpen[d.division] ?? false;
          const hasPoolPanel = isRoundRobin && !isSmall;
          const hasAnyPanelBelow = isSeedOpen || hasPoolPanel;

          // Default (auto) structure, so we can show it as the "if you
          // pick nothing, this is what happens" hint even when the
          // organizer has typed an override.
          const autoPoolStructure = isRoundRobin ? getPoolStructure(d.count) : null;
          const poolCountOverride = parseInt(numPoolsOverride[d.division] ?? "") || null;
          const poolStructure = isRoundRobin
            ? getPoolStructure(d.count, { numPools: poolCountOverride ?? undefined })
            : null;
          // Hard min of 3 teams per pool — a pool of 2 is just a
          // single head-to-head, not a round robin worth playing
          // out. getPoolStructure enforces the same clamp so even a
          // typed-in value above this gets pulled back down before
          // generation.
          const maxPoolCount = Math.max(1, Math.floor(d.count / 3));

          return (
            <div key={d.division} className="space-y-0">
              {/* Division row */}
              <div
                className={`rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                  isSelected
                    ? "border-brand-500 bg-brand-900/20"
                    : isSmall
                    ? "border-red-500/40 bg-red-900/10"
                    : "border-surface-border bg-surface-raised"
                } ${hasAnyPanelBelow ? "rounded-b-none" : ""}`}
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
                      isSmall ? "text-adaptive-red" : "text-teal-vivid"
                    }`}
                  >
                    {d.count} player{d.count !== 1 ? "s" : ""}
                  </span>
                  {!isSmall && (
                    <button
                      onClick={() => toggleSeedPanel(d.division)}
                      className={`text-xs font-medium px-1.5 py-0.5 rounded transition-colors ${
                        isSeedOpen
                          ? "text-brand-vivid bg-brand-900/20"
                          : "text-surface-muted hover:text-dark-200"
                      }`}
                    >
                      Seeds {isSeedOpen ? "▴" : "▾"}
                    </button>
                  )}
                  <button
                    onClick={() => handleCancel(d.division)}
                    className="text-xs text-adaptive-red hover:text-red-500 font-medium"
                    title="Cancel this division"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Seeding panel */}
              {isSeedOpen && (
                <div
                  className={`border border-t-0 border-surface-border bg-surface-overlay px-3 py-3 ${
                    hasPoolPanel ? "" : "rounded-b-lg"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-medium text-dark-200 uppercase tracking-wider">
                      Seed Order
                    </span>
                    <span className="text-xs text-surface-muted flex-1">
                      {isRoundRobin
                        ? "Top seeds are spread evenly across pools."
                        : "Seed 1 gets the most favourable bracket position."}
                    </span>
                    <button
                      onClick={() => randomizeSeedOrder(d.division)}
                      disabled={loadingSeeds[d.division] || savingSeeds[d.division]}
                      className="text-xs text-surface-muted hover:text-dark-100 disabled:opacity-40"
                    >
                      Randomize
                    </button>
                    <button
                      onClick={() => clearSeeds(d.division)}
                      disabled={loadingSeeds[d.division] || savingSeeds[d.division]}
                      className="text-xs text-surface-muted hover:text-adaptive-red disabled:opacity-40"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => saveSeedOrder(d.division)}
                      disabled={loadingSeeds[d.division] || savingSeeds[d.division]}
                      className="text-xs btn-primary py-0.5 px-2.5 disabled:opacity-60"
                    >
                      {savingSeeds[d.division]
                        ? "Saving…"
                        : savedSeeds[d.division]
                        ? "Saved ✓"
                        : "Save Order"}
                    </button>
                  </div>

                  {seedError[d.division] && (
                    <p className="text-xs text-adaptive-red mb-2">{seedError[d.division]}</p>
                  )}

                  {loadingSeeds[d.division] ? (
                    <div className="space-y-1.5">
                      {Array.from({ length: d.count }).map((_, i) => (
                        <div key={i} className="h-7 skeleton rounded" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {(seedPlayers[d.division] ?? []).map((player, index, arr) => (
                        <div
                          key={player.id}
                          className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-raised group"
                        >
                          <span className="text-xs text-surface-muted w-5 text-right shrink-0 tabular-nums">
                            {index + 1}.
                          </span>
                          <span className="text-sm text-dark-100 flex-1 truncate">
                            {player.display_name}
                          </span>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => moveSeedPlayer(d.division, index, index - 1)}
                              disabled={index === 0}
                              className="text-xs text-surface-muted hover:text-dark-100 disabled:opacity-20 w-5 h-5 flex items-center justify-center rounded hover:bg-surface-border"
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveSeedPlayer(d.division, index, index + 1)}
                              disabled={index === arr.length - 1}
                              className="text-xs text-surface-muted hover:text-dark-100 disabled:opacity-20 w-5 h-5 flex items-center justify-center rounded hover:bg-surface-border"
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pool play configuration (round robin only) */}
              {hasPoolPanel && poolStructure && autoPoolStructure && (
                <div className="rounded-b-lg border border-t-0 border-surface-border bg-surface-overlay px-3 py-2.5 space-y-2">
                  {/* Number of pools — organizer can override the auto-split. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-medium text-dark-200">Number of pools:</label>
                    <input
                      type="number"
                      min={1}
                      max={maxPoolCount}
                      placeholder="default"
                      value={numPoolsOverride[d.division] ?? ""}
                      onChange={(e) =>
                        setNumPoolsOverride((prev) => ({
                          ...prev,
                          [d.division]: e.target.value,
                        }))
                      }
                      className="input w-20 py-1 text-center text-xs"
                    />
                    <span className="text-xs text-surface-muted">
                      {poolCountOverride
                        ? describePoolSplit(poolStructure)
                        : `default: ${describePoolSplit(autoPoolStructure)}`}
                      {poolStructure.numPools >= 3 && " · top 2 per pool advance to bracket"}
                      {poolStructure.numPools === 2 && " · top 3 per pool advance to bracket"}
                      {poolStructure.numPools === 1 && " · top 4 advance to bracket"}
                    </span>
                  </div>

                  {/* Games per team */}
                  {(() => {
                    const gpt = parseInt(gamesPerTeam[d.division] ?? "") || null;
                    // Build description based on what each pool will actually do
                    let description: string;
                    if (gpt === null) {
                      description = "default: each team plays every opponent once";
                    } else {
                      const maxPoolSize = Math.max(...poolStructure.poolSizes);
                      const info = poolGamesInfo(maxPoolSize, gpt);
                      if (info.timesVsEachOpponent === 1) {
                        description = "each team plays every opponent once";
                      } else if (info.timesVsEachOpponent) {
                        description = `each team plays every opponent ${info.timesVsEachOpponent}×`;
                      } else {
                        description = `${gpt} games per team`;
                      }
                      // Note if any smaller odd pools will round up
                      const smallerOddPools = [...new Set(poolStructure.poolSizes)].filter(
                        (sz) => sz < maxPoolSize && sz % 2 === 1
                      );
                      if (smallerOddPools.length > 0) {
                        const smallInfo = poolGamesInfo(smallerOddPools[0], gpt);
                        if (smallInfo.actualGamesPerTeam !== gpt) {
                          description += ` (smaller pools round up to ${smallInfo.actualGamesPerTeam})`;
                        }
                      }
                    }

                    // An odd-sized pool only accepts gamesPerTeam
                    // values that are whole-lap multiples
                    // (opponents, 2·opponents, …). Filter the full
                    // 1..maxGames range by every pool's validator so
                    // the resulting list of "allowed" values is the
                    // intersection across every pool in the
                    // division. For all-even divisions this is 1..max
                    // (any integer works); as soon as one odd pool
                    // exists the list collapses to multiples of its
                    // (n − 1).
                    const allowedValues: number[] = [];
                    for (let v = 1; v <= poolStructure.maxGamesPerTeam; v++) {
                      if (poolStructure.poolSizes.every((s) => isValidGamesPerTeam(s, v))) {
                        allowedValues.push(v);
                      }
                    }
                    const hasOddPool = poolStructure.poolSizes.some((s) => s % 2 === 1);
                    const invalidForPools = gpt
                      ? poolStructure.poolSizes.filter(
                          (s) => !isValidGamesPerTeam(s, gpt)
                        )
                      : [];
                    const invalid = invalidForPools.length > 0;

                    return (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-xs font-medium text-dark-200">Games per team:</label>
                          {hasOddPool ? (
                            // Odd pools are narrow enough that a
                            // dropdown of valid values is a better
                            // control than free-text — the organizer
                            // literally can't pick something that
                            // won't schedule cleanly.
                            <select
                              value={gamesPerTeam[d.division] ?? ""}
                              onChange={(e) =>
                                setGamesPerTeam((prev) => ({
                                  ...prev,
                                  [d.division]: e.target.value,
                                }))
                              }
                              className="input w-auto py-1 text-center text-xs"
                            >
                              <option value="">default</option>
                              {allowedValues.map((v) => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min={1}
                              max={poolStructure.maxGamesPerTeam}
                              placeholder="default"
                              value={gamesPerTeam[d.division] ?? ""}
                              onChange={(e) =>
                                setGamesPerTeam((prev) => ({ ...prev, [d.division]: e.target.value }))
                              }
                              className={
                                "input w-20 py-1 text-center text-xs " +
                                (invalid ? "ring-1 ring-red-500/60" : "")
                              }
                            />
                          )}
                          <span className="text-xs text-surface-muted">{description}</span>
                        </div>
                        {invalid && (
                          <p className="mt-1 text-xs text-red-400">
                            {gpt} won&apos;t schedule cleanly for the odd pool{invalidForPools.length > 1 ? "s" : ""} of {invalidForPools.join(", ")}. Allowed: {allowedValues.join(", ")}.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Pool score to win — independent of the playoff
                      override below. Use case: a small pool of 4
                      plays to 15 instead of 6 quick games to 11.
                      Default falls back to the tournament-level
                      setting. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-medium text-dark-200">Pool score to win:</label>
                    <select
                      value={scoreToWinPool[d.division] ?? ""}
                      onChange={(e) =>
                        setScoreToWinPool((prev) => ({
                          ...prev,
                          [d.division]: e.target.value,
                        }))
                      }
                      className="input w-auto py-1 text-center text-xs"
                    >
                      <option value="">default</option>
                      <option value="11">11</option>
                      <option value="15">15</option>
                    </select>
                    <span className="text-xs text-surface-muted">
                      {scoreToWinPool[d.division]
                        ? `pool games to ${scoreToWinPool[d.division]}`
                        : "uses the tournament-level pool score"}
                    </span>
                  </div>

                  {/* Playoff score to win — separate from pool so
                      organizers can run quick pool games to 11 then
                      crown the bracket with games to 15 (or vice
                      versa). Default falls back to the
                      tournament-level setting. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-medium text-dark-200">Playoff score to win:</label>
                    <select
                      value={scoreToWinPlayoff[d.division] ?? ""}
                      onChange={(e) =>
                        setScoreToWinPlayoff((prev) => ({
                          ...prev,
                          [d.division]: e.target.value,
                        }))
                      }
                      className="input w-auto py-1 text-center text-xs"
                    >
                      <option value="">default</option>
                      <option value="11">11</option>
                      <option value="15">15</option>
                    </select>
                    <span className="text-xs text-surface-muted">
                      {scoreToWinPlayoff[d.division]
                        ? `playoff games to ${scoreToWinPlayoff[d.division]}`
                        : "uses the tournament-level playoff score"}
                    </span>
                  </div>

                  {/* Playoff teams advancing — defaults to the size-based
                      rule (4 / 3 / 2 depending on pool count). Organizer
                      can override to make a smaller or larger bracket. */}
                  {(() => {
                    const pa = parseInt(playoffAdvancing[d.division] ?? "") || null;
                    const defaultAdvancing =
                      poolStructure.numPools === 1
                        ? 4
                        : poolStructure.numPools === 2
                        ? 6
                        : poolStructure.numPools * 2;
                    const maxAdvancing = poolStructure.poolSizes.reduce((a, b) => a + b, 0);
                    const hint = pa
                      ? `${pa} team${pa === 1 ? "" : "s"} advance to playoff bracket`
                      : `default: ${defaultAdvancing} team${defaultAdvancing === 1 ? "" : "s"} advance`;
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs font-medium text-dark-200">Playoff teams:</label>
                        <input
                          type="number"
                          min={2}
                          max={maxAdvancing}
                          placeholder="default"
                          value={playoffAdvancing[d.division] ?? ""}
                          onChange={(e) =>
                            setPlayoffAdvancing((prev) => ({
                              ...prev,
                              [d.division]: e.target.value,
                            }))
                          }
                          className="input w-20 py-1 text-center text-xs"
                        />
                        <span className="text-xs text-surface-muted">{hint}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Merge controls */}
      {selectedForMerge.length >= 2 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-brand-900/20 border border-brand-500/30">
          <p className="text-xs text-brand-vivid flex-1">
            Merge {selectedForMerge.length} selected divisions into &quot;{getDivisionLabel([...selectedForMerge].sort((a, b) => SKILLS.findIndex(s => s.value === getDivision(b)?.skill) - SKILLS.findIndex(s => s.value === getDivision(a)?.skill))[0])}&quot;
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
          disabled={
            generating ||
            divisions.length === 0 ||
            divisionsWithInvalidGames.size > 0
          }
          className="btn-primary"
        >
          {generating
            ? "Generating Brackets..."
            : `Generate Brackets (${divisions.length} division${divisions.length !== 1 ? "s" : ""})`}
        </button>
        {hasSmallDivisions && (
          <p className="text-xs text-adaptive-red self-center">
            Some divisions have fewer than {MIN_PLAYERS} players
          </p>
        )}
      </div>
    </div>
  );
}
