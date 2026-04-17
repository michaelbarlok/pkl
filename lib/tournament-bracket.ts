/**
 * Tournament Bracket Generation
 *
 * Generates match structures for single elimination, double elimination,
 * and round robin formats.
 *
 * Round Robin Format:
 *   3-7 teams:  Single pool, organizer-configured rounds (max = teams-1)
 *   8-14 teams: 2 pools (split evenly), organizer-configured rounds
 *   15+ teams:  Split into pools of ~5 (target size 5, distributed evenly).
 *               Top 2 from each pool advance to a seeded single-elim bracket
 *               ranked by record then point differential.
 *
 *   For 3-7: top 4 advance to playoff (or all if fewer than 4).
 *   For 8-14: top 3 per pool (6 total) advance to 6-team playoff.
 *   For 15+: top 2 per pool advance to single-elim bracket.
 *
 *   Playoffs always include a 3rd place game.
 *   Pool matches are generated upfront; playoff matches are created when
 *   the organizer clicks "Advance to Playoffs" after pool play completes.
 */

interface BracketMatch {
  round: number;
  match_number: number;
  bracket: string;
  player1_id: string | null;
  player2_id: string | null;
  status: "pending" | "bye";
}

// ============================================================
// Single Elimination
// ============================================================

/**
 * Generate a single elimination bracket.
 *
 * Seeds are ordered by seed number (or registration order).
 * Non-power-of-2 counts get byes in round 1 for top seeds.
 */
export function generateSingleElimination(playerIds: string[]): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  // Find next power of 2
  const bracketSize = nextPowerOf2(n);
  const totalRounds = Math.log2(bracketSize);

  // Create seeded matchup order using standard bracket positioning
  const seeds = standardBracketOrder(bracketSize);
  const matches: BracketMatch[] = [];

  // Round 1
  let matchNumber = 1;
  for (let i = 0; i < seeds.length; i += 2) {
    const seed1 = seeds[i];
    const seed2 = seeds[i + 1];
    const p1 = seed1 <= n ? playerIds[seed1 - 1] : null;
    const p2 = seed2 <= n ? playerIds[seed2 - 1] : null;

    const isBye = !p1 || !p2;
    matches.push({
      round: 1,
      match_number: matchNumber++,
      bracket: "winners",
      player1_id: p1,
      player2_id: p2,
      status: isBye ? "bye" : "pending",
    });
  }

  // Subsequent rounds (empty slots, filled as winners advance)
  let matchesInRound = bracketSize / 4;
  for (let round = 2; round <= totalRounds; round++) {
    for (let m = 1; m <= matchesInRound; m++) {
      matches.push({
        round,
        match_number: m,
        bracket: "winners",
        player1_id: null,
        player2_id: null,
        status: "pending",
      });
    }
    matchesInRound = matchesInRound / 2;
  }

  return matches;
}

// ============================================================
// Double Elimination
// ============================================================

/**
 * Generate a double elimination bracket.
 *
 * Winners bracket + losers bracket + grand final.
 */
export function generateDoubleElimination(playerIds: string[]): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  // Start with the winners bracket (same as single elim)
  const winnersMatches = generateSingleElimination(playerIds).map((m) => ({
    ...m,
    bracket: "winners" as const,
  }));

  const bracketSize = nextPowerOf2(n);
  const winnersRounds = Math.log2(bracketSize);

  // Losers bracket rounds: for each winners round after round 1,
  // there are 2 losers bracket rounds (one for losers dropping in,
  // one for losers playing each other). Total losers rounds = 2*(winnersRounds-1)
  const losersRounds = 2 * (winnersRounds - 1);
  const matches: BracketMatch[] = [...winnersMatches];

  // Generate losers bracket placeholder matches
  let losersMatchesInRound = bracketSize / 4;
  for (let lr = 1; lr <= losersRounds; lr++) {
    for (let m = 1; m <= losersMatchesInRound; m++) {
      matches.push({
        round: lr,
        match_number: m,
        bracket: "losers",
        player1_id: null,
        player2_id: null,
        status: "pending",
      });
    }
    // After every 2 losers rounds, halve the match count
    if (lr % 2 === 0) {
      losersMatchesInRound = Math.max(1, losersMatchesInRound / 2);
    }
  }

  // Grand final
  matches.push({
    round: 1,
    match_number: 1,
    bracket: "grand_final",
    player1_id: null,
    player2_id: null,
    status: "pending",
  });

  return matches;
}

// ============================================================
// Round Robin (Pool Play)
// ============================================================

/**
 * Determine pool structure for a given team count.
 *   3-7 teams:  1 pool
 *   8-14 teams: 2 pools
 *   15+ teams:  pools of ~5 (Math.round(n/5) pools, distributed evenly)
 */
export function getPoolStructure(teamCount: number): {
  numPools: number;
  poolSizes: number[];
  maxRoundsPerPool: number;
} {
  if (teamCount <= 7) {
    return { numPools: 1, poolSizes: [teamCount], maxRoundsPerPool: fullRoundRobinRounds(teamCount) };
  }
  if (teamCount <= 14) {
    const half = Math.ceil(teamCount / 2);
    const other = teamCount - half;
    return {
      numPools: 2,
      poolSizes: [half, other],
      maxRoundsPerPool: Math.max(fullRoundRobinRounds(half), fullRoundRobinRounds(other)),
    };
  }
  // 15+ teams: pools of ~5
  const numPools = Math.round(teamCount / 5);
  const baseSize = Math.floor(teamCount / numPools);
  const remainder = teamCount % numPools;
  const poolSizes: number[] = [];
  for (let i = 0; i < numPools; i++) {
    poolSizes.push(baseSize + (i < remainder ? 1 : 0));
  }
  const maxPoolSize = Math.max(...poolSizes);
  return { numPools, poolSizes, maxRoundsPerPool: fullRoundRobinRounds(maxPoolSize) };
}

/**
 * Number of rounds needed for a full round robin in a pool of n teams.
 * Even pools: n-1 rounds (each round, every team plays).
 * Odd pools: n rounds (circle method adds a BYE, one team sits out each round).
 */
function fullRoundRobinRounds(n: number): number {
  return n % 2 === 0 ? n - 1 : n;
}

/**
 * Generate round robin pool play matches.
 *
 * @param playerIds - All players in this division (pre-sorted by seed if seeded=true)
 * @param poolRounds - Organizer-configured number of rounds (optional; defaults to max)
 * @param seeded - If true, use snake seeding for pool distribution instead of random shuffle.
 *                 Snake seeding spreads the top seeds evenly across pools (1→A, 2→B, 3→B, 4→A…).
 */
export function generateRoundRobin(
  playerIds: string[],
  poolRounds?: number,
  seeded?: boolean
): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const structure = getPoolStructure(n);

  // Distribute players into pools
  let pools: string[][];
  if (structure.numPools === 1) {
    // Single pool — shuffle unless seeded (order within pool doesn't affect matchups)
    pools = [seeded ? [...playerIds] : shuffle([...playerIds])];
  } else if (seeded) {
    // Snake-distribute seeded players so each pool gets an equal spread of top seeds
    pools = snakeDistribute([...playerIds], structure.poolSizes);
  } else {
    // Random: shuffle then slice sequentially
    const shuffled = shuffle([...playerIds]);
    let offset = 0;
    pools = structure.poolSizes.map((size) => {
      const pool = shuffled.slice(offset, offset + size);
      offset += size;
      return pool;
    });
  }

  // Bracket label per pool (preserve "winners"/"losers" naming for 2-pool backward compat)
  const bracketNames =
    structure.numPools === 1
      ? ["winners"]
      : structure.numPools === 2
      ? ["winners", "losers"]
      : pools.map((_, i) => `pool_${i + 1}`);

  const allMatches: BracketMatch[] = [];
  for (let i = 0; i < structure.numPools; i++) {
    const pool = pools[i];
    // Pass poolRounds directly; generatePoolMatches caps at totalRounds internally,
    // which correctly accounts for odd pools (where totalRounds = pool.length, not pool.length-1).
    allMatches.push(...generatePoolMatches(pool, bracketNames[i], poolRounds));
  }
  return allMatches;
}

/**
 * Snake-distribute players across pools so the top seeds are spread evenly.
 * E.g. for 3 pools: #1→A, #2→B, #3→C, #4→C, #5→B, #6→A, #7→A, …
 */
function snakeDistribute(playerIds: string[], poolSizes: number[]): string[][] {
  const numPools = poolSizes.length;
  const pools: string[][] = Array.from({ length: numPools }, () => []);
  let direction = 1;
  let pool = 0;
  for (const pid of playerIds) {
    pools[pool].push(pid);
    pool += direction;
    if (pool >= numPools) {
      pool = numPools - 1;
      direction = -1;
    } else if (pool < 0) {
      pool = 0;
      direction = 1;
    }
  }
  return pools;
}

/**
 * Generate round robin matches for a single pool using the circle method.
 * @param playerIds - Players in this pool
 * @param bracket - Pool identifier ("winners", "losers", "pool_1", "pool_2", etc.)
 * @param maxRounds - Number of rounds to play
 */
function generatePoolMatches(
  playerIds: string[],
  bracket: string,
  maxRounds?: number
): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const players = [...playerIds];
  // If odd number, add a dummy player for byes
  if (n % 2 === 1) {
    players.push("BYE");
  }

  const numPlayers = players.length;
  const totalRounds = numPlayers - 1;
  const roundLimit = maxRounds ? Math.min(maxRounds, totalRounds) : totalRounds;
  const matchesPerRound = numPlayers / 2;

  const matches: BracketMatch[] = [];

  // Circle method: fix player 0, rotate the rest
  for (let round = 0; round < roundLimit; round++) {
    // Build pairings for this round
    const rotated = [players[0]];
    for (let i = 1; i < numPlayers; i++) {
      const idx = ((i - 1 + round) % (numPlayers - 1)) + 1;
      rotated.push(players[idx]);
    }

    let matchNumber = 1;
    for (let m = 0; m < matchesPerRound; m++) {
      const p1 = rotated[m];
      const p2 = rotated[numPlayers - 1 - m];
      if (p1 === p2) continue;

      const isBye = p1 === "BYE" || p2 === "BYE";

      matches.push({
        round: round + 1,
        match_number: matchNumber++,
        bracket,
        player1_id: p1 === "BYE" ? null : p1,
        player2_id: p2 === "BYE" ? null : p2,
        status: isBye ? "bye" : "pending",
      });
    }
  }

  return matches;
}

// ============================================================
// Playoff Bracket (created after pool play completes)
// ============================================================

/**
 * Generate playoff bracket matches from seeded players.
 *
 * For 4 teams (single pool):
 *   R1: #1 vs #4, #2 vs #3 (semis)
 *   R2: Final + 3rd place game
 *
 * For 6 teams (two pools, top 3 each):
 *   R1: #3 vs #6, #4 vs #5 (quarters — top 2 get bye)
 *   R2: #1 vs lowest remaining, #2 vs other (semis)
 *   R3: Final + 3rd place game
 *
 * For 8+ teams (15+ division, top 2 per pool):
 *   Standard single-elimination bracket with 3rd place game.
 *
 * All matches use bracket="playoff".
 * @param seededPlayerIds - Players ordered by seed (index 0 = #1 seed)
 */
export function generatePlayoffBracket(seededPlayerIds: string[]): BracketMatch[] {
  const n = seededPlayerIds.length;

  if (n === 4) {
    return generateFourTeamPlayoff(seededPlayerIds);
  }
  if (n === 6) {
    return generateSixTeamPlayoff(seededPlayerIds);
  }

  // For any other size (including 8+ from multi-pool): single elim + 3rd place game
  return generateSingleElimWithThirdPlace(seededPlayerIds);
}

/**
 * Single elimination bracket with a 3rd place game.
 * Used for 15+ team divisions where top 2 from each pool advance.
 */
function generateSingleElimWithThirdPlace(playerIds: string[]): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const bracketSize = nextPowerOf2(n);
  const totalRounds = Math.log2(bracketSize);

  const seeds = standardBracketOrder(bracketSize);
  const matches: BracketMatch[] = [];

  // Round 1
  let matchNumber = 1;
  for (let i = 0; i < seeds.length; i += 2) {
    const seed1 = seeds[i];
    const seed2 = seeds[i + 1];
    const p1 = seed1 <= n ? playerIds[seed1 - 1] : null;
    const p2 = seed2 <= n ? playerIds[seed2 - 1] : null;

    const isBye = !p1 || !p2;
    matches.push({
      round: 1,
      match_number: matchNumber++,
      bracket: "playoff",
      player1_id: p1,
      player2_id: p2,
      status: isBye ? "bye" : "pending",
    });
  }

  // Rounds 2 through totalRounds (empty slots filled as winners advance)
  let matchesInRound = bracketSize / 4;
  for (let round = 2; round <= totalRounds; round++) {
    for (let m = 1; m <= matchesInRound; m++) {
      matches.push({
        round,
        match_number: m,
        bracket: "playoff",
        player1_id: null,
        player2_id: null,
        status: "pending",
      });
    }
    matchesInRound = matchesInRound / 2;
  }

  // Add 3rd place game in the final round (match_number 2)
  matches.push({
    round: totalRounds,
    match_number: 2,
    bracket: "playoff",
    player1_id: null,
    player2_id: null,
    status: "pending",
  });

  return matches;
}

/**
 * 4-team playoff: Semi → Final + 3rd place
 */
function generateFourTeamPlayoff(players: string[]): BracketMatch[] {
  const [s1, s2, s3, s4] = players;

  return [
    // Round 1: Semifinals
    {
      round: 1,
      match_number: 1,
      bracket: "playoff",
      player1_id: s1,
      player2_id: s4,
      status: "pending",
    },
    {
      round: 1,
      match_number: 2,
      bracket: "playoff",
      player1_id: s2,
      player2_id: s3,
      status: "pending",
    },
    // Round 2: Final
    {
      round: 2,
      match_number: 1,
      bracket: "playoff",
      player1_id: null,
      player2_id: null,
      status: "pending",
    },
    // Round 2: 3rd place game
    {
      round: 2,
      match_number: 2,
      bracket: "playoff",
      player1_id: null,
      player2_id: null,
      status: "pending",
    },
  ];
}

/**
 * 6-team playoff: QF → SF → Final + 3rd place
 * Top 2 seeds get a first-round bye.
 */
function generateSixTeamPlayoff(players: string[]): BracketMatch[] {
  const [s1, s2, s3, s4, s5, s6] = players;

  return [
    // Round 1: Quarterfinals (top 2 have bye)
    {
      round: 1,
      match_number: 1,
      bracket: "playoff",
      player1_id: s3,
      player2_id: s6,
      status: "pending",
    },
    {
      round: 1,
      match_number: 2,
      bracket: "playoff",
      player1_id: s4,
      player2_id: s5,
      status: "pending",
    },
    // Round 2: Semifinals
    // #1 vs lowest remaining seed (winner of match with lower seeds)
    {
      round: 2,
      match_number: 1,
      bracket: "playoff",
      player1_id: s1,
      player2_id: null, // filled by winner of R1M1 (3v6 — lower seeds)
      status: "pending",
    },
    {
      round: 2,
      match_number: 2,
      bracket: "playoff",
      player1_id: s2,
      player2_id: null, // filled by winner of R1M2 (4v5)
      status: "pending",
    },
    // Round 3: Final
    {
      round: 3,
      match_number: 1,
      bracket: "playoff",
      player1_id: null,
      player2_id: null,
      status: "pending",
    },
    // Round 3: 3rd place game
    {
      round: 3,
      match_number: 2,
      bracket: "playoff",
      player1_id: null,
      player2_id: null,
      status: "pending",
    },
  ];
}

/**
 * Compute standings from completed pool matches.
 * Returns player IDs sorted by: wins (desc), then point differential (desc).
 */
export function computePoolStandings(
  matches: { player1_id: string | null; player2_id: string | null; winner_id: string | null; score1: number[]; score2: number[]; status: string }[]
): { id: string; wins: number; losses: number; pointDiff: number }[] {
  const stats = new Map<string, { wins: number; losses: number; pointDiff: number }>();

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_id) continue;

    for (const pid of [m.player1_id, m.player2_id]) {
      if (pid && !stats.has(pid)) {
        stats.set(pid, { wins: 0, losses: 0, pointDiff: 0 });
      }
    }

    const s1sum = m.score1.reduce((a, b) => a + b, 0);
    const s2sum = m.score2.reduce((a, b) => a + b, 0);

    if (m.player1_id) {
      const s = stats.get(m.player1_id)!;
      if (m.winner_id === m.player1_id) s.wins++;
      else s.losses++;
      s.pointDiff += s1sum - s2sum;
    }
    if (m.player2_id) {
      const s = stats.get(m.player2_id)!;
      if (m.winner_id === m.player2_id) s.wins++;
      else s.losses++;
      s.pointDiff += s2sum - s1sum;
    }
  }

  return Array.from(stats.entries())
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
}

/**
 * Helper: detect all pool bracket labels from a set of matches.
 * Returns sorted list of bracket identifiers that represent pool play.
 */
export function getPoolBrackets(matches: { bracket: string }[]): string[] {
  const poolBrackets = new Set<string>();
  for (const m of matches) {
    if (m.bracket === "winners" || m.bracket === "losers" || m.bracket.startsWith("pool_")) {
      poolBrackets.add(m.bracket);
    }
  }
  // Sort: "winners" first, "losers" second, then pool_1, pool_2, etc.
  return Array.from(poolBrackets).sort((a, b) => {
    if (a === "winners") return -1;
    if (b === "winners") return 1;
    if (a === "losers") return -1;
    if (b === "losers") return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

/**
 * Get a display label for a pool bracket identifier.
 */
export function getPoolLabel(bracket: string, totalPools: number): string {
  if (totalPools === 1) return "Pool Play";
  if (bracket === "winners") return "Pool A";
  if (bracket === "losers") return "Pool B";
  if (bracket.startsWith("pool_")) {
    const num = parseInt(bracket.replace("pool_", ""));
    // Convert 1→A, 2→B, etc.
    return `Pool ${String.fromCharCode(64 + num)}`;
  }
  return bracket;
}

// ============================================================
// Bracket Advancement
// ============================================================

/**
 * Advance a winner through the bracket.
 * Returns the match to update (if any) when a match is completed.
 */
export function getNextMatch(
  currentMatch: { round: number; match_number: number; bracket: string },
  totalRounds: number
): { round: number; match_number: number; bracket: string; slot: "player1_id" | "player2_id" } | null {
  if (currentMatch.bracket === "winners") {
    if (currentMatch.round >= totalRounds) {
      // Winners final → grand final (for double elim)
      return { round: 1, match_number: 1, bracket: "grand_final", slot: "player1_id" };
    }
    // Advance in winners bracket
    const nextMatch = Math.ceil(currentMatch.match_number / 2);
    const slot = currentMatch.match_number % 2 === 1 ? "player1_id" : "player2_id";
    return { round: currentMatch.round + 1, match_number: nextMatch, bracket: "winners", slot };
  }

  if (currentMatch.bracket === "grand_final") {
    return null; // Tournament over
  }

  // Losers bracket advancement is more complex but follows similar halving pattern
  return null;
}

/**
 * Get the next match for a playoff bracket result.
 * Handles both winner advancement (to next round final) and
 * loser routing (semifinal losers → 3rd place game).
 *
 * Returns both winner destination and loser destination (if any).
 */
export function getPlayoffAdvancement(
  currentMatch: { round: number; match_number: number },
  allPlayoffMatches: { round: number; match_number: number }[]
): {
  winner: { round: number; match_number: number; slot: "player1_id" | "player2_id" } | null;
  loser: { round: number; match_number: number; slot: "player1_id" | "player2_id" } | null;
} {
  const maxRound = Math.max(...allPlayoffMatches.map((m) => m.round));

  // If this is the final or 3rd place game (last round), no advancement
  if (currentMatch.round >= maxRound) {
    return { winner: null, loser: null };
  }

  // Check if this is the semifinal round (round before finals)
  const isSemifinalRound = currentMatch.round === maxRound - 1;

  // Winner advances: standard bracket advancement
  const nextMatch = Math.ceil(currentMatch.match_number / 2);
  const winnerSlot = currentMatch.match_number % 2 === 1 ? "player1_id" as const : "player2_id" as const;
  const winner = {
    round: currentMatch.round + 1,
    match_number: nextMatch,
    slot: winnerSlot,
  };

  // Loser routing: only from semifinal round to 3rd place game
  let loser = null;
  if (isSemifinalRound) {
    // 3rd place game is match 2 in the final round
    const loserSlot = currentMatch.match_number % 2 === 1 ? "player1_id" as const : "player2_id" as const;
    loser = {
      round: maxRound,
      match_number: 2, // 3rd place game
      slot: loserSlot,
    };
  }

  // For QF round in 6-team bracket, winners go to specific SF slots
  if (!isSemifinalRound) {
    // Check if this is the specific 6-team QF layout (2 matches in round, top seeds have byes)
    const matchesInRound = allPlayoffMatches.filter((m) => m.round === currentMatch.round).length;
    const matchesInNextRound = allPlayoffMatches.filter((m) => m.round === currentMatch.round + 1).length;
    if (matchesInRound === 2 && matchesInNextRound === 2) {
      // 6-team bracket: R1M1 winner → R2M1 player2, R1M2 winner → R2M2 player2
      return {
        winner: {
          round: currentMatch.round + 1,
          match_number: currentMatch.match_number,
          slot: "player2_id",
        },
        loser: null,
      };
    }
  }

  return { winner, loser };
}

// ============================================================
// Helpers
// ============================================================

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate standard bracket seeding order.
 * For a bracket of size N, returns seed positions [1..N]
 * arranged so that seed 1 plays seed N, 2 plays N-1, etc.
 * with proper bracket placement to avoid top seeds meeting early.
 */
function standardBracketOrder(size: number): number[] {
  if (size === 2) return [1, 2];

  const half = standardBracketOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}

/**
 * Fisher-Yates shuffle.
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
