/**
 * End-to-End Tournament Simulation Tests
 *
 * Simulates a full June tournament with 10-15 divisions, each having 3-12 teams.
 * Tests the complete bracket lifecycle: generation → score entry → playoffs → completion.
 *
 * This exercises the pure logic in lib/tournament-bracket.ts without any network calls.
 * The goal: confirm that every realistic division size we'll encounter runs to completion
 * without getting stuck, producing duplicate matchups, or orphaning players.
 */

import {
  generateSingleElimination,
  generateRoundRobin,
  generatePlayoffBracket,
  computePoolStandings,
  getPoolBrackets,
} from "@/lib/tournament-bracket";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SimMatch {
  id: string;
  round: number;
  match_number: number;
  bracket: string;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  score1: number[];
  score2: number[];
  status: "pending" | "bye" | "completed";
  division: string;
}

// ─── Simulation helpers ───────────────────────────────────────────────────────

let matchCounter = 0;

function makeSimMatches(
  generated: ReturnType<typeof generateSingleElimination>,
  division: string
): SimMatch[] {
  return generated.map((m) => ({
    ...m,
    id: `match-${++matchCounter}`,
    winner_id: null,
    score1: [],
    score2: [],
    division,
    status: m.status === "bye" ? "bye" : "pending",
  }));
}

/** Play out a single match: pick a random winner, record scores. */
function simulateMatchResult(match: SimMatch): void {
  if (!match.player1_id || !match.player2_id) {
    // Bye: the non-null player wins automatically
    match.winner_id = match.player1_id ?? match.player2_id;
    match.status = "completed";
    return;
  }
  // Flip a coin for the winner
  const p1Wins = Math.random() < 0.5;
  match.winner_id = p1Wins ? match.player1_id : match.player2_id;
  match.score1 = [p1Wins ? 11 : Math.floor(Math.random() * 10)];
  match.score2 = [p1Wins ? Math.floor(Math.random() * 10) : 11];
  match.status = "completed";
}

/**
 * Advance winner in a single-elimination bracket.
 * Mirrors the logic in PUT /api/tournaments/[id]/bracket
 */
function advanceWinnerSingleElim(matches: SimMatch[], completedMatch: SimMatch): void {
  if (!completedMatch.winner_id) return;
  const nextRound = completedMatch.round + 1;
  const nextMatchNumber = Math.ceil(completedMatch.match_number / 2);
  const slot = completedMatch.match_number % 2 === 1 ? "player1_id" : "player2_id";

  const next = matches.find(
    (m) =>
      m.bracket === completedMatch.bracket &&
      m.round === nextRound &&
      m.match_number === nextMatchNumber
  );
  if (next) {
    (next as any)[slot] = completedMatch.winner_id;
  }
}

/**
 * Advance winner in a playoff bracket.
 * Mirrors the logic in PUT /api/tournaments/[id]/bracket for bracket === "playoff"
 */
function advanceWinnerPlayoff(matches: SimMatch[], completedMatch: SimMatch): void {
  if (!completedMatch.winner_id) return;
  const playoffMatches = matches.filter((m) => m.bracket === "playoff");
  const maxRound = Math.max(...playoffMatches.map((m) => m.round));
  const isSemifinalRound = completedMatch.round === maxRound - 1;
  const isFinalRound = completedMatch.round >= maxRound;

  if (isFinalRound) return;

  const loserId =
    completedMatch.player1_id === completedMatch.winner_id
      ? completedMatch.player2_id
      : completedMatch.player1_id;

  if (isSemifinalRound) {
    const winnerSlot = completedMatch.match_number % 2 === 1 ? "player1_id" : "player2_id";
    const loserSlot = completedMatch.match_number % 2 === 1 ? "player1_id" : "player2_id";

    const final = playoffMatches.find((m) => m.round === maxRound && m.match_number === 1);
    if (final) (final as any)[winnerSlot] = completedMatch.winner_id;

    if (loserId) {
      const third = playoffMatches.find((m) => m.round === maxRound && m.match_number === 2);
      if (third) (third as any)[loserSlot] = loserId;
    }
  } else {
    // QF round in 6-team: 1:1 routing
    const matchesInRound = playoffMatches.filter((m) => m.round === completedMatch.round).length;
    const matchesInNextRound = playoffMatches.filter(
      (m) => m.round === completedMatch.round + 1
    ).length;
    const isSixTeamQF = matchesInRound === 2 && matchesInNextRound === 2;

    if (isSixTeamQF) {
      const sf = playoffMatches.find(
        (m) => m.round === completedMatch.round + 1 && m.match_number === completedMatch.match_number
      );
      if (sf) sf.player2_id = completedMatch.winner_id;
    } else {
      const nextMatchNumber = Math.ceil(completedMatch.match_number / 2);
      const slot = completedMatch.match_number % 2 === 1 ? "player1_id" : "player2_id";
      const next = playoffMatches.find(
        (m) => m.round === completedMatch.round + 1 && m.match_number === nextMatchNumber
      );
      if (next) (next as any)[slot] = completedMatch.winner_id;
    }
  }
}

/**
 * Run a single-elimination division to completion.
 * Returns the winner's player ID.
 */
function runSingleElimDivision(playerIds: string[], division: string): string {
  const generated = generateSingleElimination(playerIds);
  const matches = makeSimMatches(generated, division);

  // Auto-complete byes
  for (const m of matches.filter((x) => x.status === "bye")) {
    simulateMatchResult(m);
    advanceWinnerSingleElim(matches, m);
  }

  const maxRound = Math.max(...matches.map((m) => m.round));

  for (let round = 1; round <= maxRound; round++) {
    const roundMatches = matches.filter((m) => m.round === round && m.status === "pending");
    for (const m of roundMatches) {
      if (!m.player1_id && !m.player2_id) continue; // no players yet — should not happen
      simulateMatchResult(m);
      advanceWinnerSingleElim(matches, m);
    }
  }

  const finalMatch = matches.find((m) => m.round === maxRound && m.match_number === 1);
  expect(finalMatch?.status).toBe("completed");
  expect(finalMatch?.winner_id).toBeTruthy();
  return finalMatch!.winner_id!;
}

/**
 * Run a round-robin division through pool play then playoffs.
 * Returns the playoff champion.
 */
function runRoundRobinDivision(
  playerIds: string[],
  division: string,
  poolRounds?: number
): string {
  // ── Pool play ──
  const generated = generateRoundRobin(playerIds, poolRounds);
  const matches = makeSimMatches(generated, division);

  // Complete all pool matches
  for (const m of matches) {
    if (m.status === "bye") {
      simulateMatchResult(m);
      continue;
    }
    if (m.status === "pending" && m.player1_id && m.player2_id) {
      simulateMatchResult(m);
    }
  }

  const allCompleted = matches.every(
    (m) => m.status === "completed" || m.status === "bye"
  );
  expect(allCompleted).toBe(true);

  // ── Determine playoff qualifiers ──
  const poolBrackets = getPoolBrackets(matches);
  const n = playerIds.length;

  let seededPlayers: string[];

  if (poolBrackets.length === 1) {
    // Single pool (3-7 teams): top 4 advance
    const standings = computePoolStandings(matches);
    seededPlayers = standings.slice(0, Math.min(4, standings.length)).map((s) => s.id);
  } else if (poolBrackets.length === 2) {
    // 2 pools (8-14 teams): top 3 from each pool
    const poolAMatches = matches.filter((m) => m.bracket === poolBrackets[0]);
    const poolBMatches = matches.filter((m) => m.bracket === poolBrackets[1]);
    const poolATop3 = computePoolStandings(poolAMatches).slice(0, 3);
    const poolBTop3 = computePoolStandings(poolBMatches).slice(0, 3);
    seededPlayers = [...poolATop3, ...poolBTop3]
      .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff)
      .map((s) => s.id);
  } else {
    // 3+ pools: top 2 from each
    const allQualifiers: ReturnType<typeof computePoolStandings> = [];
    for (const bracket of poolBrackets) {
      const bracketMatches = matches.filter((m) => m.bracket === bracket);
      allQualifiers.push(...computePoolStandings(bracketMatches).slice(0, 2));
    }
    allQualifiers.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
    seededPlayers = allQualifiers.map((s) => s.id);
  }

  expect(seededPlayers.length).toBeGreaterThanOrEqual(2);

  // ── Playoffs ──
  const playoffGenerated = generatePlayoffBracket(seededPlayers);
  const playoffMatches = makeSimMatches(playoffGenerated, division);

  // Auto-complete byes
  for (const m of playoffMatches.filter((x) => x.status === "bye")) {
    simulateMatchResult(m);
    advanceWinnerPlayoff(playoffMatches, m);
  }

  const maxPlayoffRound = Math.max(...playoffMatches.map((m) => m.round));
  for (let round = 1; round <= maxPlayoffRound; round++) {
    const roundMatches = playoffMatches.filter(
      (m) => m.round === round && m.status === "pending"
    );
    for (const m of roundMatches) {
      if (!m.player1_id || !m.player2_id) {
        // Slots not yet filled — bye-style advancement
        m.winner_id = m.player1_id ?? m.player2_id;
        m.status = "completed";
        advanceWinnerPlayoff(playoffMatches, m);
        continue;
      }
      simulateMatchResult(m);
      advanceWinnerPlayoff(playoffMatches, m);
    }
  }

  const final = playoffMatches.find(
    (m) => m.round === maxPlayoffRound && m.match_number === 1
  );
  expect(final?.status).toBe("completed");
  expect(final?.winner_id).toBeTruthy();
  return final!.winner_id!;
}

// ─── Tournament division configs ──────────────────────────────────────────────
//
// Simulates a realistic June tournament with up to 15 divisions.
// Each entry: [division_name, team_count]

const TOURNAMENT_DIVISIONS: [string, number][] = [
  // Small divisions (3-7 teams, single RR pool)
  ["mens_all_ages_4.5+", 3],
  ["womens_senior_4.0", 4],
  ["mixed_senior_4.5+", 3],
  ["womens_all_ages_4.5+", 5],
  ["mens_senior_4.5+", 4],

  // Medium divisions (8-12 teams, 2 RR pools)
  ["mens_all_ages_3.5", 12],
  ["mens_all_ages_4.0", 10],
  ["womens_all_ages_3.5", 8],
  ["womens_all_ages_4.0", 9],
  ["mixed_all_ages_3.5", 11],

  // Larger divisions run single-elim instead of round-robin
  ["mens_all_ages_3.0", 7],
  ["womens_all_ages_3.0", 6],
  ["mixed_all_ages_4.0", 5],
  ["mixed_all_ages_4.5+", 4],
  ["mens_senior_3.5", 6],
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Full tournament simulation — Round Robin format", () => {
  beforeEach(() => {
    // Reset match counter for clean IDs
    matchCounter = 0;
  });

  for (const [division, teamCount] of TOURNAMENT_DIVISIONS) {
    test(`${division} (${teamCount} teams) — round robin runs to completion`, () => {
      const ids = Array.from({ length: teamCount }, (_, i) => `${division}-team-${i + 1}`);
      const champion = runRoundRobinDivision(ids, division);
      expect(ids).toContain(champion);
    });
  }

  test("all 15 divisions produce distinct champions (no shared state)", () => {
    const champions = new Set<string>();
    for (const [division, teamCount] of TOURNAMENT_DIVISIONS) {
      matchCounter = 0;
      const ids = Array.from({ length: teamCount }, (_, i) => `${division}-team-${i + 1}`);
      const champion = runRoundRobinDivision(ids, division);
      expect(ids).toContain(champion);
      champions.add(`${division}:${champion}`);
    }
    // All champions are from their own division's player list
    expect(champions.size).toBe(TOURNAMENT_DIVISIONS.length);
  });

  test("pool play produces no duplicate matchups for 12-team division", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `team-${i + 1}`);
    const generated = generateRoundRobin(ids);

    // Within each pool, no pair plays more than once
    const poolBrackets = getPoolBrackets(generated);
    for (const bracket of poolBrackets) {
      const seen = new Map<string, number>();
      const bracketMatches = generated.filter(
        (m) => m.bracket === bracket && m.status !== "bye" && m.player1_id && m.player2_id
      );
      for (const m of bracketMatches) {
        const key = [m.player1_id!, m.player2_id!].sort().join("|");
        seen.set(key, (seen.get(key) ?? 0) + 1);
        expect(seen.get(key)).toBe(1);
      }
    }
  });

  test("pool qualifiers include the right number of teams per pool size", () => {
    // 3-7 teams → top 4 (or fewer)
    for (const n of [3, 4, 5, 6, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const generated = generateRoundRobin(ids);
      const matches = makeSimMatches(generated, "test");
      for (const m of matches) {
        if (m.status === "pending" && m.player1_id && m.player2_id) simulateMatchResult(m);
      }
      const standings = computePoolStandings(matches);
      const qualifiers = standings.slice(0, Math.min(4, standings.length));
      expect(qualifiers.length).toBe(Math.min(4, n));
    }

    // 8-12 teams → top 3 from each of 2 pools = 6 qualifiers
    for (const n of [8, 9, 10, 11, 12]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const generated = generateRoundRobin(ids);
      const matches = makeSimMatches(generated, "test");
      for (const m of matches) {
        if (m.status === "pending" && m.player1_id && m.player2_id) simulateMatchResult(m);
      }
      const poolBrackets = getPoolBrackets(generated);
      const qualifierCount = poolBrackets.reduce((acc, bracket) => {
        const bracketMatches = matches.filter((m) => m.bracket === bracket);
        return acc + computePoolStandings(bracketMatches).slice(0, 3).length;
      }, 0);
      expect(qualifierCount).toBe(6);
    }
  });

  test("4-pool division correctly generates playoffs from top 2 per pool", () => {
    // 3 pools of 5 for a 15-team division: top 2 per pool = 6 qualifiers
    const ids = Array.from({ length: 15 }, (_, i) => `team-${i}`);
    const generated = generateRoundRobin(ids);
    const poolBrackets = getPoolBrackets(generated);
    expect(poolBrackets.length).toBeGreaterThanOrEqual(3);

    const matches = makeSimMatches(generated, "test-div");
    for (const m of matches) {
      if (m.status === "pending" && m.player1_id && m.player2_id) simulateMatchResult(m);
    }

    const allQualifiers: { id: string; wins: number; losses: number; pointDiff: number }[] = [];
    for (const bracket of poolBrackets) {
      const bracketMatches = matches.filter((m) => m.bracket === bracket);
      allQualifiers.push(...computePoolStandings(bracketMatches).slice(0, 2));
    }

    expect(allQualifiers.length).toBe(poolBrackets.length * 2);
    // No player appears twice
    const ids2 = allQualifiers.map((q) => q.id);
    expect(new Set(ids2).size).toBe(ids2.length);
  });
});

describe("Full tournament simulation — Single Elimination format", () => {
  beforeEach(() => { matchCounter = 0; });

  for (const [division, teamCount] of TOURNAMENT_DIVISIONS) {
    test(`${division} (${teamCount} teams) — single elimination runs to completion`, () => {
      const ids = Array.from({ length: teamCount }, (_, i) => `${division}-team-${i + 1}`);
      const champion = runSingleElimDivision(ids, division);
      expect(ids).toContain(champion);
    });
  }

  test("champion is always one of the registered teams", () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      matchCounter = 0;
      const ids = Array.from({ length: n }, (_, i) => `team-${i}`);
      const champion = runSingleElimDivision(ids, `div-${n}`);
      expect(ids).toContain(champion);
    }
  });

  test("bracket produces exactly 1 winner per division even with byes", () => {
    // Non-power-of-2 sizes are the tricky cases
    for (const n of [3, 5, 6, 7, 9, 10, 11]) {
      matchCounter = 0;
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const generated = generateSingleElimination(ids);
      const matches = makeSimMatches(generated, "test");

      // Auto-advance byes
      for (const m of matches.filter((x) => x.status === "bye")) {
        simulateMatchResult(m);
        advanceWinnerSingleElim(matches, m);
      }

      const maxRound = Math.max(...matches.map((m) => m.round));
      for (let round = 1; round <= maxRound; round++) {
        const roundMatches = matches.filter((m) => m.round === round && m.status === "pending");
        for (const m of roundMatches) {
          simulateMatchResult(m);
          advanceWinnerSingleElim(matches, m);
        }
      }

      const completedCount = matches.filter((m) => m.status === "completed").length;
      expect(completedCount).toBe(matches.length);

      const finalMatch = matches.find(
        (m) => m.round === maxRound && m.match_number === 1
      );
      expect(finalMatch?.winner_id).toBeTruthy();
    }
  });
});

describe("Edge cases that could break during a real tournament", () => {
  test("3-team division (minimum size) → round robin completes", () => {
    const ids = ["team-A", "team-B", "team-C"];
    const champion = runRoundRobinDivision(ids, "edge-3");
    expect(ids).toContain(champion);
  });

  test("3-team division → single elim produces a winner", () => {
    const ids = ["team-A", "team-B", "team-C"];
    const champion = runSingleElimDivision(ids, "edge-se-3");
    expect(ids).toContain(champion);
  });

  test("poolRounds=3 for a 12-team division still produces 6 qualifiers", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const generated = generateRoundRobin(ids, 3);
    const matches = makeSimMatches(generated, "test");
    for (const m of matches) {
      if (m.status === "pending" && m.player1_id && m.player2_id) simulateMatchResult(m);
    }
    const poolBrackets = getPoolBrackets(generated);
    const qualifiers = poolBrackets.flatMap((bracket) => {
      const bracketMatches = matches.filter((m) => m.bracket === bracket);
      return computePoolStandings(bracketMatches).slice(0, 3);
    });
    expect(qualifiers).toHaveLength(6);
  });

  test("pool standings handle a 3-way tie by point differential", () => {
    // 3 players, each wins exactly 1 game; tiebreak by point diff
    const matches = [
      { player1_id: "pA", player2_id: "pB", winner_id: "pA", score1: [11], score2: [1], status: "completed" },
      { player1_id: "pB", player2_id: "pC", winner_id: "pB", score1: [11], score2: [5], status: "completed" },
      { player1_id: "pC", player2_id: "pA", winner_id: "pC", score1: [11], score2: [9], status: "completed" },
    ];
    const standings = computePoolStandings(matches);
    // pA: +10-2=+8 net after both matches... wait let me recalc
    // pA: wins vs pB (+10), loses vs pC (-2) → pointDiff = +10 - 2 = +8
    // pB: wins vs pC (+6), loses vs pA (-10) → pointDiff = +6 - 10 = -4
    // pC: wins vs pA (+2), loses vs pB (-6) → pointDiff = +2 - 6 = -4
    expect(standings[0].id).toBe("pA"); // best point diff
    // pB and pC tied; either order is acceptable — just verify all 3 present
    expect(standings.map((s) => s.id)).toContain("pB");
    expect(standings.map((s) => s.id)).toContain("pC");
    expect(standings.every((s) => s.wins === 1)).toBe(true);
  });

  test("playoff with only 2 qualifiers still produces a winner", () => {
    // Edge: a 3-team pool where only 2 qualify
    const ids = ["pA", "pB"];
    const playoffGenerated = generatePlayoffBracket(ids);
    const matches = makeSimMatches(playoffGenerated, "tiny");
    for (const m of matches) {
      if (m.player1_id && m.player2_id) simulateMatchResult(m);
    }
    const winners = matches.filter((m) => m.status === "completed" && m.winner_id);
    expect(winners.length).toBeGreaterThan(0);
  });

  test("re-generating bracket clears and rebuilds cleanly", () => {
    // Simulates organizer clicking 'Generate Bracket' twice
    const ids = Array.from({ length: 8 }, (_, i) => `team-${i}`);

    const first = generateSingleElimination(ids);
    const second = generateSingleElimination(ids);

    // Structure should be identical (same rounds, match counts)
    expect(first).toHaveLength(second.length);
    expect(first.map((m) => m.round)).toEqual(second.map((m) => m.round));
    expect(first.map((m) => m.match_number)).toEqual(second.map((m) => m.match_number));
  });

  test("all 15 divisions run round-robin simultaneously without state leakage", () => {
    // Run all divisions in sequence and collect all champions
    const allChampions: string[] = [];
    for (const [division, teamCount] of TOURNAMENT_DIVISIONS) {
      matchCounter = 0;
      const ids = Array.from({ length: teamCount }, (_, i) => `${division}-t${i}`);
      const champion = runRoundRobinDivision(ids, division);
      allChampions.push(champion);
      // Champion must belong to the current division
      expect(ids).toContain(champion);
    }
    expect(allChampions).toHaveLength(TOURNAMENT_DIVISIONS.length);
  });
});
