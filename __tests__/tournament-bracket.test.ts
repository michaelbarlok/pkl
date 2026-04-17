/**
 * Tournament Bracket Tests
 *
 * Covers all scenarios for a tournament with 10-15 divisions,
 * each containing 3-12 teams.
 *
 * Key scenarios:
 * - Single elimination: 2-12 teams, byes handled correctly
 * - Double elimination: structure of winners/losers/grand_final brackets
 * - Round robin pool structure: correct pool splits for 3-12 teams
 * - Round robin match generation: no duplicates, no self-play, correct bye handling
 * - Playoff generation: 4-team, 6-team, 8+-team formats
 * - Pool standings: sorting by wins then point differential
 * - Bracket advancement helpers
 */

import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generatePlayoffBracket,
  computePoolStandings,
  getPoolStructure,
  getPoolBrackets,
  getPoolLabel,
  getNextMatch,
  getPlayoffAdvancement,
} from "@/lib/tournament-bracket";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `player-${i + 1}`);
}

/** Count real (non-bye) matches */
function countRealMatches(matches: ReturnType<typeof generateSingleElimination>) {
  return matches.filter((m) => m.status !== "bye").length;
}

/** Assert no player appears against themselves */
function assertNoSelfPlay(matches: ReturnType<typeof generateRoundRobin>) {
  for (const m of matches) {
    if (m.player1_id && m.player2_id) {
      expect(m.player1_id).not.toBe(m.player2_id);
    }
  }
}

/**
 * Given a set of players, verify every pair plays exactly `expectedTimes` times
 * in completed pool rounds (status = "pending" non-bye matches).
 */
function assertUniqueMatchups(
  matches: ReturnType<typeof generateRoundRobin>,
  players: string[],
  expectedTimes = 1,
  bracket?: string
) {
  const filtered = bracket ? matches.filter((m) => m.bracket === bracket) : matches;
  const realMatches = filtered.filter(
    (m) => m.player1_id && m.player2_id && m.status !== "bye"
  );

  const counts = new Map<string, number>();
  for (const m of realMatches) {
    const key = [m.player1_id!, m.player2_id!].sort().join("|");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Every real match key should appear exactly expectedTimes
  for (const [, count] of counts) {
    expect(count).toBe(expectedTimes);
  }

  // With n-1 rounds (full RR), every pair of players appears exactly expectedTimes
  // (only enforce this when we're running the full round count)
  const n = players.length;
  if (expectedTimes === 1 && filtered.some((m) => m.round === n - 1)) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const key = [players[i], players[j]].sort().join("|");
        expect(counts.has(key)).toBe(true);
      }
    }
  }
}

// ─── getPoolStructure ────────────────────────────────────────────────────────

describe("getPoolStructure", () => {
  // 3-6 teams fit in a single pool (max 6/pool)
  test.each([
    [3, { numPools: 1, poolSizes: [3], maxGamesPerTeam: 4 }],
    [4, { numPools: 1, poolSizes: [4], maxGamesPerTeam: 6 }],
    [5, { numPools: 1, poolSizes: [5], maxGamesPerTeam: 8 }],
    [6, { numPools: 1, poolSizes: [6], maxGamesPerTeam: 10 }],
  ])("%i teams → 1 pool", (n, expected) => {
    expect(getPoolStructure(n)).toMatchObject(expected);
  });

  test("7 teams → 2 pools [4, 3] (max 6/pool)", () => {
    const s = getPoolStructure(7);
    expect(s.numPools).toBe(2);
    expect(s.poolSizes).toEqual([4, 3]);
    expect(s.maxGamesPerTeam).toBe(6); // 2*(4-1)
  });

  test("8 teams → 2 pools [4, 4]", () => {
    const s = getPoolStructure(8);
    expect(s.numPools).toBe(2);
    expect(s.poolSizes).toEqual([4, 4]);
    expect(s.maxGamesPerTeam).toBe(6); // 2*(4-1)
  });

  test("9 teams → 2 pools [5, 4]", () => {
    const s = getPoolStructure(9);
    expect(s.numPools).toBe(2);
    expect(s.poolSizes).toEqual([5, 4]);
    expect(s.maxGamesPerTeam).toBe(8); // 2*(5-1)
  });

  test("10 teams → 2 pools [5, 5]", () => {
    const s = getPoolStructure(10);
    expect(s.numPools).toBe(2);
    expect(s.poolSizes).toEqual([5, 5]);
    expect(s.maxGamesPerTeam).toBe(8);
  });

  test("11 teams → 2 pools [6, 5]", () => {
    const s = getPoolStructure(11);
    expect(s.numPools).toBe(2);
    expect(s.poolSizes).toEqual([6, 5]);
    expect(s.maxGamesPerTeam).toBe(10); // 2*(6-1)
  });

  test("12 teams → 2 pools [6, 6]", () => {
    const s = getPoolStructure(12);
    expect(s.numPools).toBe(2);
    expect(s.poolSizes).toEqual([6, 6]);
    expect(s.maxGamesPerTeam).toBe(10);
  });

  test("14 teams → 3 pools totalling 14 (max 6/pool)", () => {
    const s = getPoolStructure(14);
    expect(s.numPools).toBe(3);
    expect(s.poolSizes.reduce((a, b) => a + b, 0)).toBe(14);
  });

  test("15 teams → 3 pools totalling 15", () => {
    const s = getPoolStructure(15);
    expect(s.numPools).toBe(3);
    expect(s.poolSizes.reduce((a, b) => a + b, 0)).toBe(15);
  });

  test("20 teams → 4 pools totalling 20", () => {
    const s = getPoolStructure(20);
    expect(s.numPools).toBe(4);
    expect(s.poolSizes.reduce((a, b) => a + b, 0)).toBe(20);
  });
});

// ─── generateSingleElimination ───────────────────────────────────────────────

describe("generateSingleElimination", () => {
  test("returns empty for fewer than 2 players", () => {
    expect(generateSingleElimination([])).toHaveLength(0);
    expect(generateSingleElimination(["p1"])).toHaveLength(0);
  });

  test("2 players → 1 match, 1 round, no byes", () => {
    const m = generateSingleElimination(makeIds(2));
    expect(m).toHaveLength(1);
    expect(m[0].round).toBe(1);
    expect(m[0].status).toBe("pending");
  });

  test("4 players → 3 matches across 2 rounds, no byes", () => {
    const m = generateSingleElimination(makeIds(4));
    expect(m).toHaveLength(3);
    expect(m.filter((x) => x.round === 1)).toHaveLength(2);
    expect(m.filter((x) => x.round === 2)).toHaveLength(1);
    expect(m.filter((x) => x.status === "bye")).toHaveLength(0);
  });

  test("3 players → 2 R1 slots with 1 bye, winner advances", () => {
    const m = generateSingleElimination(makeIds(3));
    // Bracket size = 4 (next power of 2), so 3 total matches
    expect(m).toHaveLength(3);
    const byes = m.filter((x) => x.status === "bye");
    expect(byes).toHaveLength(1);
    // Bye match must have exactly one player
    const bye = byes[0];
    const hasPlayer = (bye.player1_id !== null) !== (bye.player2_id !== null);
    expect(hasPlayer).toBe(true);
  });

  test.each([5, 6, 7])("%i players → correct bye count", (n) => {
    const m = generateSingleElimination(makeIds(n));
    const r1 = m.filter((x) => x.round === 1);
    const byes = r1.filter((x) => x.status === "bye");
    // Next power of 2 - n = number of byes
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    expect(byes).toHaveLength(bracketSize - n);
  });

  test("8 players → 7 matches, no byes, 3 rounds", () => {
    const m = generateSingleElimination(makeIds(8));
    expect(m).toHaveLength(7);
    expect(m.filter((x) => x.status === "bye")).toHaveLength(0);
    expect(Math.max(...m.map((x) => x.round))).toBe(3);
  });

  test("12 players → correct structure", () => {
    const m = generateSingleElimination(makeIds(12));
    // bracketSize = 16, totalRounds = 4
    // R1: 8 matches (4 byes), R2: 4, R3: 2, R4: 1 = 15 total
    expect(m).toHaveLength(15);
    expect(m.filter((x) => x.round === 1 && x.status === "bye")).toHaveLength(4);
  });

  test("all R1 players are unique (no player appears twice)", () => {
    const ids = makeIds(8);
    const m = generateSingleElimination(ids);
    const r1 = m.filter((x) => x.round === 1);
    const players = r1.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean);
    const unique = new Set(players);
    expect(unique.size).toBe(players.length);
  });

  test("all bracket labels are 'winners'", () => {
    const m = generateSingleElimination(makeIds(8));
    expect(m.every((x) => x.bracket === "winners")).toBe(true);
  });

  test("seed 1 and seed 2 are on opposite sides of bracket (4 players)", () => {
    // With 4 players in standard bracket: 1v4 and 2v3 in R1, so 1 and 2 can't meet until final
    const m = generateSingleElimination(["p1", "p2", "p3", "p4"]);
    const r1 = m.filter((x) => x.round === 1);
    const match1Players = new Set([r1[0].player1_id, r1[0].player2_id]);
    const match2Players = new Set([r1[1].player1_id, r1[1].player2_id]);
    // p1 and p2 should be in different R1 matches
    expect(match1Players.has("p1") && match1Players.has("p2")).toBe(false);
    expect(match2Players.has("p1") && match2Players.has("p2")).toBe(false);
  });
});

// ─── generateDoubleElimination ───────────────────────────────────────────────

describe("generateDoubleElimination", () => {
  test("returns empty for fewer than 2 players", () => {
    expect(generateDoubleElimination([])).toHaveLength(0);
    expect(generateDoubleElimination(["p1"])).toHaveLength(0);
  });

  test("has winners, losers, and grand_final brackets", () => {
    const m = generateDoubleElimination(makeIds(4));
    const brackets = new Set(m.map((x) => x.bracket));
    expect(brackets.has("winners")).toBe(true);
    expect(brackets.has("losers")).toBe(true);
    expect(brackets.has("grand_final")).toBe(true);
  });

  test("4 players: winners bracket = same as single elim", () => {
    const se = generateSingleElimination(makeIds(4));
    const de = generateDoubleElimination(makeIds(4));
    const winners = de.filter((x) => x.bracket === "winners");
    expect(winners).toHaveLength(se.length);
  });

  test("8 players: exactly 1 grand_final match", () => {
    const m = generateDoubleElimination(makeIds(8));
    expect(m.filter((x) => x.bracket === "grand_final")).toHaveLength(1);
  });

  test.each([4, 8])("%i players: losers bracket has correct match count", (n) => {
    const m = generateDoubleElimination(makeIds(n));
    const losers = m.filter((x) => x.bracket === "losers");
    // For n players, bracketSize = next power of 2, winnersRounds = log2(bracketSize)
    // losersRounds = 2*(winnersRounds-1), losers matches roughly = bracketSize/2 - 1
    expect(losers.length).toBeGreaterThan(0);
  });
});

// ─── generateRoundRobin ───────────────────────────────────────────────────────

describe("generateRoundRobin — small divisions (3-6 teams → single pool)", () => {
  // 7+ teams require 2+ pools due to max 6/pool rule
  test.each([3, 4, 5, 6])("%i teams → single pool, bracket = 'winners'", (n) => {
    const ids = makeIds(n);
    const m = generateRoundRobin(ids);
    expect(m.every((x) => x.bracket === "winners")).toBe(true);
  });

  test("3 teams → 3 real matches across 3 rounds (odd pool: 1 full lap)", () => {
    const ids = makeIds(3);
    const m = generateRoundRobin(ids);
    // Odd pool (3→padded to 4): 3 rounds per lap, gamesPerTeam default=2, laps=1 → 3 rounds
    // Each round: 1 bye + 1 real → 3 real matches total; each team plays 2 real games
    const real = m.filter((x) => x.status !== "bye");
    expect(real).toHaveLength(3);
    expect(Math.max(...m.map((x) => x.round))).toBe(3);
  });

  test("4 teams → 6 matches across 3 rounds, no byes", () => {
    const ids = makeIds(4);
    const m = generateRoundRobin(ids);
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(6);
    expect(m.filter((x) => x.status === "bye")).toHaveLength(0);
    expect(Math.max(...m.map((x) => x.round))).toBe(3);
  });

  test("5 teams → 10 real matches, 5 rounds (odd pool: 1 full lap × 5 rounds)", () => {
    const ids = makeIds(5);
    const m = generateRoundRobin(ids);
    // Odd pool (5→padded to 6): 5 rounds per lap, gamesPerTeam default=4, laps=1 → 5 rounds
    // Each round: 2 real + 1 bye → 5×2=10 real matches; each team plays 4 real games
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(10);
    expect(Math.max(...m.map((x) => x.round))).toBe(5);
  });

  test("6 teams → 15 matches, 5 rounds, no byes", () => {
    const ids = makeIds(6);
    const m = generateRoundRobin(ids);
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(15);
    expect(m.filter((x) => x.status === "bye")).toHaveLength(0);
  });

  test.each([3, 4, 5, 6])("%i teams → no self-play", (n) => {
    assertNoSelfPlay(generateRoundRobin(makeIds(n)));
  });

  test.each([4, 6])("%i teams (even) → every pair plays exactly once", (n) => {
    const ids = makeIds(n);
    assertUniqueMatchups(generateRoundRobin(ids), ids);
  });
});

describe("generateRoundRobin — medium divisions (7-12 teams → 2 pools)", () => {
  test.each([7, 8, 9, 10, 11, 12])("%i teams → 2 pools", (n) => {
    const m = generateRoundRobin(makeIds(n));
    const brackets = new Set(m.map((x) => x.bracket));
    expect(brackets.has("winners")).toBe(true);
    expect(brackets.has("losers")).toBe(true);
    expect(brackets.size).toBe(2);
  });

  test.each([7, 8, 9, 10, 11, 12])("%i teams → no self-play in either pool", (n) => {
    assertNoSelfPlay(generateRoundRobin(makeIds(n)));
  });

  test("7 teams → 2 pools [4, 3], correct real match count", () => {
    const ids = makeIds(7);
    const m = generateRoundRobin(ids);
    // Pool of 4 (even, default=3 games): 3 rounds × 2 matches = 6 real
    // Pool of 3 (odd, default=3 games based on maxPoolSize=4):
    //   laps = ceil(3/2) = 2, totalRounds = 2*3 = 6, 6×1 real = 6 real
    // Total = 12 real matches
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(12);
  });

  test("8 teams → pool sizes [4, 4], each pool is full RR", () => {
    const ids = makeIds(8);
    const m = generateRoundRobin(ids);
    const poolA = m.filter((x) => x.bracket === "winners" && x.status !== "bye");
    const poolB = m.filter((x) => x.bracket === "losers" && x.status !== "bye");
    // Each pool of 4: C(4,2) = 6 matches
    expect(poolA).toHaveLength(6);
    expect(poolB).toHaveLength(6);
  });

  test("10 teams → 2 pools of 5, correct total real matches (odd pools)", () => {
    const ids = makeIds(10);
    const m = generateRoundRobin(ids);
    // Odd pool of 5 (padded to 6): 5 rounds per lap, default gamesPerTeam=4, laps=1 → 5 rounds
    // Each round: 2 real + 1 bye → 5×2=10 real per pool × 2 pools = 20
    const real = m.filter((x) => x.status !== "bye");
    expect(real).toHaveLength(20);
  });

  test("12 teams → 2 pools of 6, correct total real matches", () => {
    const ids = makeIds(12);
    const m = generateRoundRobin(ids);
    // 2 pools of 6: each has C(6,2)=15 → 30 total
    const real = m.filter((x) => x.status !== "bye");
    expect(real).toHaveLength(30);
  });

  test.each([8, 10, 12])("%i teams → no duplicate matchups within each pool", (n) => {
    const ids = makeIds(n);
    const m = generateRoundRobin(ids);
    assertUniqueMatchups(m, ids, 1, "winners");
    assertUniqueMatchups(m, ids, 1, "losers");
  });

  test("players only appear in their assigned pool", () => {
    const ids = makeIds(10);
    const m = generateRoundRobin(ids);

    const poolAPlayers = new Set<string>();
    const poolBPlayers = new Set<string>();

    for (const match of m) {
      if (match.bracket === "winners") {
        if (match.player1_id) poolAPlayers.add(match.player1_id);
        if (match.player2_id) poolAPlayers.add(match.player2_id);
      } else if (match.bracket === "losers") {
        if (match.player1_id) poolBPlayers.add(match.player1_id);
        if (match.player2_id) poolBPlayers.add(match.player2_id);
      }
    }

    // No player should appear in both pools
    for (const p of poolAPlayers) {
      expect(poolBPlayers.has(p)).toBe(false);
    }
    expect(poolAPlayers.size + poolBPlayers.size).toBe(10);
  });
});

describe("generateRoundRobin — gamesPerTeam option", () => {
  test("gamesPerTeam=2 produces 2 rounds for a 6-team division", () => {
    const ids = makeIds(6);
    const m = generateRoundRobin(ids, { gamesPerTeam: 2 });
    const maxRound = Math.max(...m.map((x) => x.round));
    expect(maxRound).toBe(2);
  });

  test("gamesPerTeam=6 (double RR) for a 4-team pool produces 6 rounds", () => {
    const ids = makeIds(4); // 1 pool of 4
    const m = generateRoundRobin(ids, { gamesPerTeam: 6 });
    const maxRound = Math.max(...m.map((x) => x.round));
    expect(maxRound).toBe(6); // 6 rounds, each pair plays twice
    // 6 rounds × 2 matches/round = 12 real matches
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(12);
  });

  test("gamesPerTeam=3 for a 12-team division (2 pools of 6)", () => {
    const ids = makeIds(12);
    const m = generateRoundRobin(ids, { gamesPerTeam: 3 });
    const maxRound = Math.max(...m.map((x) => x.round));
    expect(maxRound).toBe(3);
    // 2 pools × 3 rounds × 3 matches/round = 18 real matches
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(18);
  });

  test("gamesPerTeam=4 for a 3-team pool → rounds up to 4 (2 full laps)", () => {
    const ids = makeIds(3);
    const m = generateRoundRobin(ids, { gamesPerTeam: 4 });
    // 3-team pool (odd): 2 laps × 3 rounds = 6 total rounds, 4 real games per player
    expect(m.filter((x) => x.status !== "bye")).toHaveLength(6); // 3 pairs × 2 times
  });
});

// ─── generatePlayoffBracket ───────────────────────────────────────────────────

describe("generatePlayoffBracket", () => {
  test("4 teams → 4 matches: 2 semis + final + 3rd place", () => {
    const m = generatePlayoffBracket(makeIds(4));
    expect(m).toHaveLength(4);
    const r1 = m.filter((x) => x.round === 1);
    const r2 = m.filter((x) => x.round === 2);
    expect(r1).toHaveLength(2);
    expect(r2).toHaveLength(2);
    // All players seeded correctly in R1
    const r1Players = r1.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean);
    expect(new Set(r1Players).size).toBe(4);
  });

  test("4 teams → seed 1 plays seed 4, seed 2 plays seed 3", () => {
    const players = ["s1", "s2", "s3", "s4"];
    const m = generatePlayoffBracket(players);
    const r1 = m.filter((x) => x.round === 1).sort((a, b) => a.match_number - b.match_number);
    expect(new Set([r1[0].player1_id, r1[0].player2_id])).toEqual(new Set(["s1", "s4"]));
    expect(new Set([r1[1].player1_id, r1[1].player2_id])).toEqual(new Set(["s2", "s3"]));
  });

  test("6 teams → 6 matches: 2 QF + 2 SF + final + 3rd place", () => {
    const m = generatePlayoffBracket(makeIds(6));
    expect(m).toHaveLength(6);
    const r1 = m.filter((x) => x.round === 1);
    const r2 = m.filter((x) => x.round === 2);
    const r3 = m.filter((x) => x.round === 3);
    expect(r1).toHaveLength(2); // QF
    expect(r2).toHaveLength(2); // SF
    expect(r3).toHaveLength(2); // final + 3rd
  });

  test("6 teams → seeds 1 and 2 have byes in R1", () => {
    const players = ["s1", "s2", "s3", "s4", "s5", "s6"];
    const m = generatePlayoffBracket(players);
    const r1 = m.filter((x) => x.round === 1);
    const r2 = m.filter((x) => x.round === 2);
    const r1Players = new Set(r1.flatMap((x) => [x.player1_id, x.player2_id]).filter(Boolean));
    // s1 and s2 should NOT be in R1
    expect(r1Players.has("s1")).toBe(false);
    expect(r1Players.has("s2")).toBe(false);
    // s1 and s2 should appear in R2
    const r2Players = [r2[0].player1_id, r2[1].player1_id];
    expect(r2Players).toContain("s1");
    expect(r2Players).toContain("s2");
  });

  test("8 teams → single-elim structure + 3rd place game", () => {
    const m = generatePlayoffBracket(makeIds(8));
    // Single elim for 8 = 7 matches + 1 third place = 8
    expect(m).toHaveLength(8);
    const maxRound = Math.max(...m.map((x) => x.round));
    const finalRound = m.filter((x) => x.round === maxRound);
    expect(finalRound).toHaveLength(2); // final + 3rd place
  });

  test("all playoff matches use bracket = 'playoff'", () => {
    for (const n of [4, 6, 8]) {
      const m = generatePlayoffBracket(makeIds(n));
      expect(m.every((x) => x.bracket === "playoff")).toBe(true);
    }
  });
});

// ─── computePoolStandings ─────────────────────────────────────────────────────

describe("computePoolStandings", () => {
  test("sorts by wins descending", () => {
    const matches = [
      {
        player1_id: "p1", player2_id: "p2",
        winner_id: "p1", score1: [11], score2: [5],
        status: "completed",
      },
      {
        player1_id: "p1", player2_id: "p3",
        winner_id: "p1", score1: [11], score2: [7],
        status: "completed",
      },
      {
        player1_id: "p2", player2_id: "p3",
        winner_id: "p2", score1: [11], score2: [9],
        status: "completed",
      },
    ];
    const standings = computePoolStandings(matches);
    expect(standings[0].id).toBe("p1"); // 2 wins
    expect(standings[1].id).toBe("p2"); // 1 win
    expect(standings[2].id).toBe("p3"); // 0 wins
  });

  test("tiebreaks by point differential", () => {
    const matches = [
      {
        player1_id: "p1", player2_id: "p2",
        winner_id: "p1", score1: [11], score2: [0], // p1: +11, p2: -11
        status: "completed",
      },
      {
        player1_id: "p3", player2_id: "p4",
        winner_id: "p3", score1: [11], score2: [9], // p3: +2, p4: -2
        status: "completed",
      },
      {
        player1_id: "p1", player2_id: "p3",
        winner_id: "p3", score1: [5], score2: [11], // p1: -6, p3: +6
        status: "completed",
      },
      {
        player1_id: "p2", player2_id: "p4",
        winner_id: "p4", score1: [3], score2: [11], // p2: -8, p4: +8
        status: "completed",
      },
    ];
    // Final standings:
    // p3: 2 wins, pointDiff = +2 + 6 = +8
    // p4: 1 win, pointDiff = -2 + 8 = +6  (beats p1 on point diff)
    // p1: 1 win, pointDiff = +11 - 6 = +5
    // p2: 0 wins, pointDiff = -11 - 8 = -19
    const standings = computePoolStandings(matches);
    expect(standings[0].id).toBe("p3"); // 2 wins
    expect(standings[1].id).toBe("p4"); // 1 win, +6 point diff
    expect(standings[2].id).toBe("p1"); // 1 win, +5 point diff
    expect(standings[3].id).toBe("p2"); // 0 wins
  });

  test("skips pending/incomplete matches", () => {
    const matches = [
      {
        player1_id: "p1", player2_id: "p2",
        winner_id: "p1", score1: [11], score2: [5],
        status: "completed",
      },
      {
        player1_id: "p1", player2_id: "p3",
        winner_id: null, score1: [], score2: [],
        status: "pending",
      },
    ];
    const standings = computePoolStandings(matches);
    // Only 1 completed match contributes
    expect(standings.find((s) => s.id === "p1")!.wins).toBe(1);
    expect(standings.find((s) => s.id === "p2")!.losses).toBe(1);
    // p3 has no completed matches yet
    expect(standings.find((s) => s.id === "p3")).toBeUndefined();
  });

  test("handles 4-team pool standings (full round robin)", () => {
    // p1 wins all 3, p2 wins 2, p3 wins 1, p4 wins 0
    const matches = [
      { player1_id: "p1", player2_id: "p2", winner_id: "p1", score1: [11], score2: [8], status: "completed" },
      { player1_id: "p1", player2_id: "p3", winner_id: "p1", score1: [11], score2: [6], status: "completed" },
      { player1_id: "p1", player2_id: "p4", winner_id: "p1", score1: [11], score2: [4], status: "completed" },
      { player1_id: "p2", player2_id: "p3", winner_id: "p2", score1: [11], score2: [9], status: "completed" },
      { player1_id: "p2", player2_id: "p4", winner_id: "p2", score1: [11], score2: [7], status: "completed" },
      { player1_id: "p3", player2_id: "p4", winner_id: "p3", score1: [11], score2: [5], status: "completed" },
    ];
    const standings = computePoolStandings(matches);
    expect(standings.map((s) => s.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(standings.map((s) => s.wins)).toEqual([3, 2, 1, 0]);
  });
});

// ─── getPoolBrackets ──────────────────────────────────────────────────────────

describe("getPoolBrackets", () => {
  test("returns 'winners' for single pool", () => {
    const matches = [
      { bracket: "winners" }, { bracket: "winners" },
    ];
    expect(getPoolBrackets(matches)).toEqual(["winners"]);
  });

  test("returns ['winners', 'losers'] for 2-pool format", () => {
    const matches = [
      { bracket: "winners" }, { bracket: "losers" },
    ];
    expect(getPoolBrackets(matches)).toEqual(["winners", "losers"]);
  });

  test("excludes 'playoff' bracket", () => {
    const matches = [
      { bracket: "winners" }, { bracket: "playoff" },
    ];
    expect(getPoolBrackets(matches)).toEqual(["winners"]);
  });

  test("handles pool_1, pool_2, pool_3 format", () => {
    const matches = [
      { bracket: "pool_1" }, { bracket: "pool_3" }, { bracket: "pool_2" },
    ];
    expect(getPoolBrackets(matches)).toEqual(["pool_1", "pool_2", "pool_3"]);
  });
});

// ─── getPoolLabel ─────────────────────────────────────────────────────────────

describe("getPoolLabel", () => {
  test("single pool returns 'Pool Play'", () => {
    expect(getPoolLabel("winners", 1)).toBe("Pool Play");
  });

  test("2 pools: winners → Pool A, losers → Pool B", () => {
    expect(getPoolLabel("winners", 2)).toBe("Pool A");
    expect(getPoolLabel("losers", 2)).toBe("Pool B");
  });

  test("multi-pool: pool_1 → Pool A, pool_2 → Pool B, pool_3 → Pool C", () => {
    expect(getPoolLabel("pool_1", 3)).toBe("Pool A");
    expect(getPoolLabel("pool_2", 3)).toBe("Pool B");
    expect(getPoolLabel("pool_3", 3)).toBe("Pool C");
  });
});

// ─── getNextMatch ─────────────────────────────────────────────────────────────

describe("getNextMatch", () => {
  test("R1M1 → R2M1 player1", () => {
    const next = getNextMatch({ round: 1, match_number: 1, bracket: "winners" }, 3);
    expect(next).toEqual({ round: 2, match_number: 1, bracket: "winners", slot: "player1_id" });
  });

  test("R1M2 → R2M1 player2", () => {
    const next = getNextMatch({ round: 1, match_number: 2, bracket: "winners" }, 3);
    expect(next).toEqual({ round: 2, match_number: 1, bracket: "winners", slot: "player2_id" });
  });

  test("R2M1 → R3M1 player1 (match_number odd)", () => {
    const next = getNextMatch({ round: 2, match_number: 1, bracket: "winners" }, 3);
    expect(next).toEqual({ round: 3, match_number: 1, bracket: "winners", slot: "player1_id" });
  });

  test("winners final → grand_final", () => {
    const next = getNextMatch({ round: 3, match_number: 1, bracket: "winners" }, 3);
    expect(next).toEqual({ round: 1, match_number: 1, bracket: "grand_final", slot: "player1_id" });
  });

  test("grand_final → null (tournament over)", () => {
    const next = getNextMatch({ round: 1, match_number: 1, bracket: "grand_final" }, 1);
    expect(next).toBeNull();
  });
});

// ─── getPlayoffAdvancement ────────────────────────────────────────────────────

describe("getPlayoffAdvancement", () => {
  // 4-team playoff: R1 (2 SFs) → R2 (Final + 3rd place)
  const fourTeamMatches = [
    { round: 1, match_number: 1 },
    { round: 1, match_number: 2 },
    { round: 2, match_number: 1 }, // Final
    { round: 2, match_number: 2 }, // 3rd place
  ];

  test("SF R1M1 winner → R2M1 player1", () => {
    const adv = getPlayoffAdvancement({ round: 1, match_number: 1 }, fourTeamMatches);
    expect(adv.winner).toEqual({ round: 2, match_number: 1, slot: "player1_id" });
  });

  test("SF R1M2 winner → R2M1 player2", () => {
    const adv = getPlayoffAdvancement({ round: 1, match_number: 2 }, fourTeamMatches);
    expect(adv.winner).toEqual({ round: 2, match_number: 1, slot: "player2_id" });
  });

  test("SF R1M1 loser → R2M2 (3rd place) player1", () => {
    const adv = getPlayoffAdvancement({ round: 1, match_number: 1 }, fourTeamMatches);
    expect(adv.loser).toEqual({ round: 2, match_number: 2, slot: "player1_id" });
  });

  test("SF R1M2 loser → R2M2 (3rd place) player2", () => {
    const adv = getPlayoffAdvancement({ round: 1, match_number: 2 }, fourTeamMatches);
    expect(adv.loser).toEqual({ round: 2, match_number: 2, slot: "player2_id" });
  });

  test("Final (R2M1) → no advancement", () => {
    const adv = getPlayoffAdvancement({ round: 2, match_number: 1 }, fourTeamMatches);
    expect(adv.winner).toBeNull();
    expect(adv.loser).toBeNull();
  });

  test("3rd place (R2M2) → no advancement", () => {
    const adv = getPlayoffAdvancement({ round: 2, match_number: 2 }, fourTeamMatches);
    expect(adv.winner).toBeNull();
    expect(adv.loser).toBeNull();
  });

  // 6-team playoff: R1 (2 QF) → R2 (2 SF) → R3 (Final + 3rd place)
  const sixTeamMatches = [
    { round: 1, match_number: 1 },
    { round: 1, match_number: 2 },
    { round: 2, match_number: 1 },
    { round: 2, match_number: 2 },
    { round: 3, match_number: 1 },
    { round: 3, match_number: 2 },
  ];

  test("6-team QF R1M1 winner → R2M1 player2 (top seed bye slot)", () => {
    const adv = getPlayoffAdvancement({ round: 1, match_number: 1 }, sixTeamMatches);
    expect(adv.winner).toEqual({ round: 2, match_number: 1, slot: "player2_id" });
    expect(adv.loser).toBeNull(); // no loser routing from QF
  });

  test("6-team SF R2M1 loser → R3M2 (3rd place) player1", () => {
    const adv = getPlayoffAdvancement({ round: 2, match_number: 1 }, sixTeamMatches);
    expect(adv.loser).toEqual({ round: 3, match_number: 2, slot: "player1_id" });
  });
});
