/**
 * Tournament Bracket Generation
 *
 * Generates match structures for single elimination, double elimination,
 * and round robin formats.
 *
 * Round Robin Format (max 6 teams per pool, pools sized automatically):
 *   3-6 teams:  Single pool.
 *   7-12 teams: 2 pools (split as evenly as possible).
 *   13+ teams:  3+ pools of ~5 teams each.
 *
 *   Organizer optionally specifies games_per_team (default = full round robin per pool).
 *
 *   Playoff qualifiers:
 *     1 pool:  top 4 advance (or all if fewer).
 *     2 pools: top 3 per pool (6-team playoff).
 *     3+ pools: top 2 per pool, re-seeded by record then point differential.
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
  /** Best-of-3 finals: 1 for the first game (only one generated up
   *  front; Game 2/3 spawn dynamically as scores come in). */
  series_game?: number | null;
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
 *
 * By default pools are sized automatically: as few pools as possible
 * with at most 6 teams each, distributed as evenly as possible
 * (larger pools first). Organizers can override the pool count per
 * division — if they pass `numPools`, we split the teams across that
 * many pools (as evenly as possible, larger pools first) instead.
 */
export function getPoolStructure(
  teamCount: number,
  options?: { numPools?: number }
): {
  numPools: number;
  poolSizes: number[];
  maxGamesPerTeam: number;
} {
  // Organizer override. Clamp into a sane range: at least 1 pool, and
  // at most floor(teamCount/3) so every pool still has ≥3 teams. A
  // pool of 2 is just a single best-of-1 head-to-head — no real round
  // robin to play out — so we refuse to split that small even when
  // explicitly asked. (Tiny divisions with <3 teams fall back to 1
  // pool because the max(1, …) floor still pins a minimum.)
  const override = options?.numPools;
  const maxReasonable = Math.max(1, Math.floor(teamCount / 3));
  const numPools = override && override >= 1
    ? Math.min(override, maxReasonable)
    // 7 teams is a special case: we'd rather run one pool of 7 (full
    // pool play, up to 6 games per team) than split into 4+3. Past 7,
    // the usual max-6-per-pool rule kicks in.
    : teamCount === 7
      ? 1
      : Math.max(1, Math.ceil(teamCount / 6));

  // Distribute as evenly as possible (larger pools first)
  const baseSize = Math.floor(teamCount / numPools);
  const remainder = teamCount % numPools;
  const poolSizes = Array.from({ length: numPools }, (_, i) =>
    baseSize + (i < remainder ? 1 : 0)
  );

  // UI cap: double round robin of the largest pool
  const maxPoolSize = Math.max(...poolSizes);
  const maxGamesPerTeam = 2 * (maxPoolSize - 1);

  return { numPools, poolSizes, maxGamesPerTeam };
}

/**
 * Describe what a given games-per-team value means for a pool of poolSize teams.
 *
 * For even pools: any value is valid; games per team = rounds played.
 * For odd pools: games are rounded up to the next complete lap so every player
 *   finishes with the same number of real games.
 *
 * Returns:
 *   actualGamesPerTeam – real games each team will play (may exceed requested for odd pools)
 *   timesVsEachOpponent – how many times teams face each other (null = not uniform)
 */
export function poolGamesInfo(
  poolSize: number,
  gamesPerTeam: number
): {
  actualGamesPerTeam: number;
  timesVsEachOpponent: number | null;
  valid: boolean;
} {
  const opponents = poolSize - 1;
  if (poolSize % 2 === 1) {
    // Odd pool: only whole-lap multiples schedule cleanly. Anything
    // else would give different teams different game counts because
    // of the BYE rotation. Callers should block the submit rather
    // than silently round up.
    const valid = gamesPerTeam % opponents === 0;
    const laps = Math.ceil(gamesPerTeam / opponents);
    return {
      actualGamesPerTeam: laps * opponents,
      timesVsEachOpponent: laps,
      valid,
    };
  } else {
    // Even pool: any integer ≥ 1 works — each round is a perfect
    // matching so every team plays exactly gamesPerTeam games.
    const times = gamesPerTeam % opponents === 0 ? gamesPerTeam / opponents : null;
    return {
      actualGamesPerTeam: gamesPerTeam,
      timesVsEachOpponent: times,
      valid: gamesPerTeam >= 1,
    };
  }
}

/**
 * Convenience: does this gamesPerTeam value schedule cleanly for a
 * pool of `poolSize` teams? (Wrapper over poolGamesInfo.valid.)
 */
export function isValidGamesPerTeam(poolSize: number, gamesPerTeam: number): boolean {
  if (!Number.isInteger(gamesPerTeam) || gamesPerTeam < 1) return false;
  if (poolSize < 2) return false;
  return poolGamesInfo(poolSize, gamesPerTeam).valid;
}

/**
 * Generate round robin pool play matches.
 *
 * Pools are sized automatically (max 6/pool, as few pools as possible).
 *
 * @param playerIds All players in this division (pre-sorted by seed when seeded=true)
 * @param options.gamesPerTeam  Games each team plays in pool play.
 *   Omit to default to a full round robin (each team plays every opponent once).
 *   Supports values > (poolSize-1) for multi-lap scheduling.
 *   Odd pools round up to the next complete lap to guarantee equal game counts.
 * @param options.seeded  Use snake seeding for pool distribution instead of random shuffle.
 */
export function generateRoundRobin(
  playerIds: string[],
  options?: { gamesPerTeam?: number; seeded?: boolean; numPools?: number; rng?: () => number }
): BracketMatch[] {
  const { gamesPerTeam, seeded, numPools, rng } = options ?? {};
  const n = playerIds.length;
  if (n < 2) return [];

  const structure = getPoolStructure(n, { numPools });

  // Distribute players into pools
  let pools: string[][];
  if (seeded) {
    pools = snakeDistribute([...playerIds], structure.poolSizes);
  } else {
    const shuffled = shuffle([...playerIds]);
    let offset = 0;
    pools = structure.poolSizes.map((size) => {
      const pool = shuffled.slice(offset, offset + size);
      offset += size;
      return pool;
    });
  }

  // Bracket label per pool (preserve "winners"/"losers" for 2-pool backward compat)
  const bracketNames =
    structure.numPools === 1
      ? ["winners"]
      : structure.numPools === 2
      ? ["winners", "losers"]
      : pools.map((_, i) => `pool_${i + 1}`);

  const allMatches: BracketMatch[] = [];
  for (let i = 0; i < structure.numPools; i++) {
    // Default: full round robin for this specific pool (each team plays every opponent once)
    const perPoolGames = gamesPerTeam ?? (pools[i].length - 1);
    allMatches.push(...generatePoolMatches(pools[i], bracketNames[i], perPoolGames));
  }
  // Defensive invariant check: no pool-play round should contain
  // duplicate pairings or place any team in more than one real
  // match. If the generator ever produces such a schedule (the real
  // tournament that hit this bug had 3 corrupted rows we still
  // don't have a perfect repro for), fail loudly now instead of
  // silently writing a broken bracket.
  assertValidRoundRobinSchedule(allMatches);
  return allMatches;
}

/**
 * Throw if any round of any bracket has a team in two non-BYE
 * matches or the same pairing twice. Called at the end of
 * generateRoundRobin so the caller never sees a corrupted schedule.
 */
function assertValidRoundRobinSchedule(matches: BracketMatch[]): void {
  const byRoundBracket = new Map<string, BracketMatch[]>();
  for (const m of matches) {
    const key = `${m.bracket}|${m.round}`;
    if (!byRoundBracket.has(key)) byRoundBracket.set(key, []);
    byRoundBracket.get(key)!.push(m);
  }
  // Per-round invariants: no player in two matches, no pair twice.
  for (const [key, bucket] of byRoundBracket) {
    const seenPlayers = new Set<string>();
    const seenPairs = new Set<string>();
    for (const m of bucket) {
      if (m.status === "bye") continue;
      if (m.player1_id && seenPlayers.has(m.player1_id)) {
        throw new Error(
          `Round-robin generator produced an invalid schedule — player ${m.player1_id} is in two matches of ${key}`
        );
      }
      if (m.player2_id && seenPlayers.has(m.player2_id)) {
        throw new Error(
          `Round-robin generator produced an invalid schedule — player ${m.player2_id} is in two matches of ${key}`
        );
      }
      if (m.player1_id) seenPlayers.add(m.player1_id);
      if (m.player2_id) seenPlayers.add(m.player2_id);
      if (m.player1_id && m.player2_id) {
        const pair = [m.player1_id, m.player2_id].sort().join("|");
        if (seenPairs.has(pair)) {
          throw new Error(
            `Round-robin generator produced an invalid schedule — pair ${pair} appears twice in ${key}`
          );
        }
        seenPairs.add(pair);
      }
    }
  }

  // Per-pool invariant: every team in the same bracket plays the
  // SAME number of real (non-BYE) games. The previous per-round
  // checks caught duplicate pairings but not "team A plays 5 games,
  // team B plays 4." This guarantees within-pool fairness — what
  // organizers actually mean by "round robin."
  const gamesPerPlayerByBracket = new Map<string, Map<string, number>>();
  for (const m of matches) {
    if (m.status === "bye") continue;
    if (!m.player1_id || !m.player2_id) continue;
    const counts = gamesPerPlayerByBracket.get(m.bracket) ?? new Map<string, number>();
    counts.set(m.player1_id, (counts.get(m.player1_id) ?? 0) + 1);
    counts.set(m.player2_id, (counts.get(m.player2_id) ?? 0) + 1);
    gamesPerPlayerByBracket.set(m.bracket, counts);
  }
  for (const [bracket, counts] of gamesPerPlayerByBracket) {
    const values = Array.from(counts.values());
    if (values.length === 0) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max !== min) {
      const offenders = Array.from(counts.entries())
        .filter(([, n]) => n !== min)
        .map(([id, n]) => `${id}:${n}`)
        .join(", ");
      throw new Error(
        `Round-robin generator produced an unbalanced schedule for bracket ${bracket} — game counts range ${min}-${max}. Offenders (vs base ${min}): ${offenders}`
      );
    }
  }
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
 * Supports multiple laps (gamesPerTeam > poolSize-1).
 * For odd-sized pools the BYE-padded schedule wraps correctly across laps.
 *
 * @param playerIds - Players in this pool
 * @param bracket   - Pool identifier ("winners", "losers", "pool_1", …)
 * @param gamesPerTeam - Target games each real player should play.
 *   Even pools: exactly this many rounds are generated.
 *   Odd pools:  rounded up to the next complete lap so every player
 *               plays the same number of real games.
 */
/**
 * Generate round robin pool play matches (deterministic per call by
 * default; pass `rng` for a seeded RNG in tests).
 *
 * Rules for picking which matches to include:
 *   - Full round robin (gamesPerTeam === opponents) → all rounds.
 *   - Under-full (gamesPerTeam < opponents) → a random subset of
 *     rounds of size gamesPerTeam. For even pools every team plays
 *     exactly gamesPerTeam games; for odd pools a team may land a
 *     BYE in a picked round and play one fewer (unavoidable given
 *     the BYE rotation).
 *   - Over-full (gamesPerTeam > opponents) → floor(gamesPerTeam /
 *     opponents) complete laps + (gamesPerTeam % opponents) random
 *     additional rounds. This is what gives the "each team plays
 *     every opponent once plus N randomized extras" behavior.
 *
 * Rounds come from the standard circle method; we just pick which
 * lap indices to emit and in what order.
 *
 *   Odd pools: per-lap contains `roundsPerLap = n` rotations (with
 *   one BYE per round). Real games per lap = n - 1.
 *   Even pools: per-lap contains `roundsPerLap = n - 1` rotations.
 *   Real games per lap = n - 1.
 *
 * @param playerIds  Pool participants, already distributed.
 * @param bracket    Label used on each match row (e.g. "winners").
 * @param gamesPerTeam  How many pool games each team should play.
 */
function generatePoolMatches(
  playerIds: string[],
  bracket: string,
  gamesPerTeam: number
): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const players = [...playerIds];
  const isOdd = n % 2 === 1;
  if (isOdd) players.push("BYE");

  const numPlayers = players.length; // always even
  const roundsPerLap = numPlayers - 1;
  const matchesPerRound = numPlayers / 2;
  const opponents = n - 1; // "real" opponents per team

  // Every team in the pool must play the same number of games.
  //
  // EVEN pools: each round in the circle rotation is a perfect
  //   matching (everyone plays), so any subset of rounds gives
  //   every team the same game count. We can emit full laps + a
  //   random partial lap for extras.
  //
  // ODD pools: each round has one BYE. A partial lap gives some
  //   teams more games than others depending on BYE distribution,
  //   so balance is impossible without whole laps. We round
  //   gamesPerTeam UP to the nearest multiple of opponents and emit
  //   that many full laps — no random extras.
  const roundSequence: number[] = [];
  let fullLaps: number;
  let extras: number;
  if (isOdd) {
    fullLaps = Math.max(1, Math.ceil(gamesPerTeam / opponents));
    extras = 0;
  } else {
    fullLaps = Math.max(0, Math.floor(gamesPerTeam / opponents));
    extras = Math.max(0, gamesPerTeam % opponents);
  }

  for (let lap = 0; lap < fullLaps; lap++) {
    for (let r = 0; r < roundsPerLap; r++) roundSequence.push(r);
  }
  if (extras > 0) {
    // Even pools, partial-lap leftover: rematches always start from
    // round 1 and proceed in order. Round N rematches round 1, round
    // N+1 rematches round 2, etc. Deterministic — randomising would
    // mean the same gamesPerTeam value can produce different
    // schedules across regenerations, which surprises organizers.
    for (let r = 0; r < extras; r++) roundSequence.push(r);
  }

  const matches: BracketMatch[] = [];

  for (let round = 0; round < roundSequence.length; round++) {
    const lapRound = roundSequence[round];

    // Circle method: fix slot 0, rotate the rest by lapRound positions
    const rotated = [players[0]];
    for (let i = 1; i < numPlayers; i++) {
      const idx = ((i - 1 + lapRound) % (numPlayers - 1)) + 1;
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
export function generatePlayoffBracket(
  seededPlayerIds: string[],
  options?: { finalsBestOf3?: boolean }
): BracketMatch[] {
  const n = seededPlayerIds.length;
  const bestOf3 = options?.finalsBestOf3 ?? false;

  let matches: BracketMatch[];
  if (n === 4) {
    matches = generateFourTeamPlayoff(seededPlayerIds);
  } else if (n === 6) {
    matches = generateSixTeamPlayoff(seededPlayerIds);
  } else {
    // For any other size (including 8+ from multi-pool): single elim + 3rd place game
    matches = generateSingleElimWithThirdPlace(seededPlayerIds);
  }

  if (bestOf3 && matches.length > 0) {
    // Mark the championship row as Game 1 of a best-of-3 series.
    // Subsequent games (2 and 3) get spawned by the score-entry
    // endpoint as Game 1 / Game 2 complete — Game 3 only when the
    // series is tied 1-1, never up front. The 3rd place game stays
    // as a single-game match (match_number 2 in the final round).
    const maxRound = Math.max(...matches.map((m) => m.round));
    for (const m of matches) {
      if (m.round === maxRound && m.match_number === 1) {
        m.series_game = 1;
      }
    }
  }

  return matches;
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
 * Compute pool-play standings with the full tiebreaker stack.
 *
 * Sort order:
 *   1. Wins (desc)
 *   2. Point differential (desc)
 *   3. Head-to-head wins among the tied teams only (desc)
 *   4. Head-to-head point differential among the tied teams only (desc)
 *   5. Stable hash of player_id ("coin flip") — deterministic per
 *      player so reloads don't reshuffle positions.
 *
 * Each row carries a `tiebreakerReason` describing WHY it ranked
 * above the row immediately below it when overall record alone
 * couldn't separate them. Null when the row in question wasn't tied
 * with anyone (or was tied but no metric distinguished — extremely
 * rare). UIs render this as a small note under the team name once
 * pool play is complete.
 *
 * BYE matches and unfinished matches are skipped (status !== "completed"
 * or no winner_id).
 */
export interface PoolStandingRow {
  id: string;
  wins: number;
  losses: number;
  pointDiff: number;
  /** Short, user-facing note describing why this row beat the row
   *  ranked directly below it in a tie. Null when no tiebreaker
   *  applied. */
  tiebreakerReason: string | null;
}

export function computePoolStandings(
  matches: { player1_id: string | null; player2_id: string | null; winner_id: string | null; score1: number[]; score2: number[]; status: string }[]
): PoolStandingRow[] {
  const stats = new Map<string, { wins: number; losses: number; pointDiff: number }>();
  // h2hWins[a][b] = 1 if a beat b, summed across any repeat matchups.
  const h2hWins = new Map<string, Map<string, number>>();
  // h2hPointDiff[a][b] = a's signed point margin vs b, summed.
  const h2hPointDiff = new Map<string, Map<string, number>>();

  function ensurePlayer(id: string) {
    if (!stats.has(id)) stats.set(id, { wins: 0, losses: 0, pointDiff: 0 });
    if (!h2hWins.has(id)) h2hWins.set(id, new Map());
    if (!h2hPointDiff.has(id)) h2hPointDiff.set(id, new Map());
  }

  // First pass: register every player who appears in any match (even
  // BYE-only entries) so a team that's still 0-0 shows up in the
  // standings table.
  for (const m of matches) {
    if (m.player1_id) ensurePlayer(m.player1_id);
    if (m.player2_id) ensurePlayer(m.player2_id);
  }

  for (const m of matches) {
    if (m.status !== "completed" || !m.winner_id) continue;

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

    // H2H tracking — only for matches where both sides exist (BYEs
    // already filtered out via status/winner guards above).
    if (m.player1_id && m.player2_id) {
      const p1wins = h2hWins.get(m.player1_id)!;
      const p2wins = h2hWins.get(m.player2_id)!;
      if (m.winner_id === m.player1_id) {
        p1wins.set(m.player2_id, (p1wins.get(m.player2_id) ?? 0) + 1);
      } else if (m.winner_id === m.player2_id) {
        p2wins.set(m.player1_id, (p2wins.get(m.player1_id) ?? 0) + 1);
      }

      const p1pd = h2hPointDiff.get(m.player1_id)!;
      const p2pd = h2hPointDiff.get(m.player2_id)!;
      p1pd.set(m.player2_id, (p1pd.get(m.player2_id) ?? 0) + (s1sum - s2sum));
      p2pd.set(m.player1_id, (p2pd.get(m.player1_id) ?? 0) + (s2sum - s1sum));
    }
  }

  // Initial sort — just the "overall" metrics.
  const entries = Array.from(stats.entries()).map(([id, s]) => ({ id, ...s }));
  entries.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);

  // Resolve ties inside each cluster (same wins AND same pointDiff).
  type Decorated = { id: string; wins: number; losses: number; pointDiff: number; _h2hW: number; _h2hP: number; _hash: number };
  const sorted: Decorated[] = [];
  let i = 0;
  while (i < entries.length) {
    let j = i + 1;
    while (
      j < entries.length &&
      entries[j].wins === entries[i].wins &&
      entries[j].pointDiff === entries[i].pointDiff
    ) {
      j++;
    }

    const cluster = entries.slice(i, j);
    const clusterIds = new Set(cluster.map((e) => e.id));

    // H2H wins / H2H pd — count only matches between cluster members.
    const decorated: Decorated[] = cluster.map((e) => {
      const w = h2hWins.get(e.id) ?? new Map();
      const p = h2hPointDiff.get(e.id) ?? new Map();
      let h2hW = 0;
      let h2hP = 0;
      for (const opponent of clusterIds) {
        if (opponent === e.id) continue;
        h2hW += w.get(opponent) ?? 0;
        h2hP += p.get(opponent) ?? 0;
      }
      return { ...e, _h2hW: h2hW, _h2hP: h2hP, _hash: stableIdHash(e.id) };
    });

    decorated.sort(
      (a, b) =>
        b._h2hW - a._h2hW ||
        b._h2hP - a._h2hP ||
        a._hash - b._hash
    );

    sorted.push(...decorated);
    i = j;
  }

  // Annotate each row with the reason it ranked above the row
  // immediately below it. Walk adjacent pairs; the first metric that
  // differs is the tiebreaker that decided the order.
  const output: PoolStandingRow[] = sorted.map((d) => ({
    id: d.id,
    wins: d.wins,
    losses: d.losses,
    pointDiff: d.pointDiff,
    tiebreakerReason: null,
  }));
  for (let k = 0; k < sorted.length - 1; k++) {
    const a = sorted[k];
    const b = sorted[k + 1];
    if (a.wins !== b.wins) continue; // not a tie at all
    if (a.pointDiff !== b.pointDiff) {
      // Point differential is already visible in the +/- column —
      // surfacing "Higher point differential" again is noise. Leave
      // tiebreakerReason null so the UI stays quiet for this case
      // and only annotates the genuinely non-obvious tiebreakers
      // below.
      continue;
    }
    if (a._h2hW !== b._h2hW) {
      output[k].tiebreakerReason = "Won head-to-head";
      continue;
    }
    if (a._h2hP !== b._h2hP) {
      output[k].tiebreakerReason = "Higher head-to-head point differential";
      continue;
    }
    // Truly identical on every metric — the stable-hash fallback
    // settled it. Players accept this with a fair-coin framing.
    output[k].tiebreakerReason = "Coin flip (set at bracket creation)";
  }

  return output;
}

/**
 * Cross-pool playoff seeding for divisions split into multiple pools.
 *
 * Inputs: per-pool standings (already H2H-resolved within each pool
 * by computePoolStandings) plus how many teams to take from each
 * pool. Returns the merged seeded list ranked using:
 *   1. Wins (desc)
 *   2. Point differential (desc)
 *   3. Head-to-head — ONLY when the two teams played in the same
 *      pool. Cross-pool teams never met, so this step is skipped
 *      for them.
 *   4. Stable hash of player_id for cross-pool ties — deterministic
 *      so the same standings always produce the same seed order on
 *      reload, but visually random across teams. Surfaced as
 *      "Coin flip (different pools — these teams never played each
 *      other)" so the organizer (and the players in the seeding
 *      panel) understand the bracket position was decided by a
 *      coin-flip equivalent rather than any on-court result.
 *
 * tiebreakerReason annotates the row that ranked above the row
 * directly below when wins+PD couldn't split them. Same-pool ties
 * inherit whichever H2H reason computePoolStandings already
 * recorded; cross-pool ties get the random-selection note.
 */
export interface SeededPlayoffTeam {
  id: string;
  pool: string;
  wins: number;
  losses: number;
  pointDiff: number;
  /** Position in the source pool (1-indexed). Useful for display
   *  when explaining "Pool A's #2 seed" etc. */
  poolFinish: number;
  tiebreakerReason: string | null;
}

export function computeCrossPoolSeeding(
  perPool: {
    bracket: string;
    standings: PoolStandingRow[];
    takeCount: number;
  }[]
): SeededPlayoffTeam[] {
  // Snapshot the top-K from each pool, remembering which pool the
  // team came from + its 1-indexed finish there. Same-pool order in
  // standings is already final (H2H done by computePoolStandings).
  type Decorated = SeededPlayoffTeam & { _hash: number };
  const teams: Decorated[] = [];
  for (const p of perPool) {
    const take = p.standings.slice(0, p.takeCount);
    for (let i = 0; i < take.length; i++) {
      const r = take[i];
      teams.push({
        id: r.id,
        pool: p.bracket,
        wins: r.wins,
        losses: r.losses,
        pointDiff: r.pointDiff,
        poolFinish: i + 1,
        tiebreakerReason: null,
        _hash: stableIdHash(r.id),
      });
    }
  }

  // Same-pool order must be preserved (the pool's standings already
  // ran H2H to settle ties). When two teams in the same pool tie on
  // (wins, pointDiff) here too, we defer to the original pool order
  // — the team that finished higher in the pool stays higher in the
  // merged list.
  const poolOrderById = new Map<string, number>();
  for (let i = 0; i < teams.length; i++) {
    poolOrderById.set(teams[i].id, teams[i].poolFinish);
  }

  teams.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    // Cross-pool: pools may have different sizes so a team can land
    // here with the same `wins` but a different `losses` count
    // (e.g. 2-1 from a 4-team pool vs 2-2 from a 5-team pool). The
    // 2-1 team has a stronger record — sort losses ascending before
    // we even look at point differential.
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
    if (a.pool === b.pool) {
      // Same pool — fall through to the underlying pool standings
      // order (which has H2H already applied).
      return (poolOrderById.get(a.id) ?? 0) - (poolOrderById.get(b.id) ?? 0);
    }
    // Different pools, fully tied on stats — stable hash decides.
    return a._hash - b._hash;
  });

  // Annotate the tiebreaker that decided each adjacent pair. Skip
  // PD ties since the +/- column already shows that.
  for (let k = 0; k < teams.length - 1; k++) {
    const a = teams[k];
    const b = teams[k + 1];
    if (a.wins !== b.wins) continue;
    // Same wins but fewer losses → record-strength tiebreaker. Note
    // it explicitly so the Review Advancement UI can show the
    // organizer why a 2-1 jumped above a 2-2.
    if (a.losses !== b.losses) {
      a.tiebreakerReason = "Better record — same wins, fewer losses";
      continue;
    }
    if (a.pointDiff !== b.pointDiff) continue;
    if (a.pool === b.pool) {
      // Same-pool tie — pull through whatever H2H reason the pool
      // standings already recorded for this row. The
      // computePoolStandings caller upstream provides this; we don't
      // have it here, so default to a generic same-pool note.
      a.tiebreakerReason = "Higher head-to-head finish (same pool)";
    } else {
      a.tiebreakerReason =
        "Coin flip (different pools — these teams never played each other)";
    }
  }

  return teams.map(({ _hash: _omit, ...rest }) => {
    void _omit;
    return rest;
  });
}

/**
 * Human label for a tournament match's bracket/round position.
 *
 * Pool play: "Pool A · Round 3" / "Pool 2 · Round 1"
 * Playoff (depth measured from the final round):
 *   - max round, match_number 1 → "Final"
 *   - max round, match_number 2 → "3rd Place"
 *   - max round − 1            → "Semifinal"
 *   - max round − 2            → "Quarterfinal"
 *   - deeper                   → "Round of N" where N doubles each step
 *
 * `maxPlayoffRound` must be the largest round number among playoff
 * matches in this match's division — a single match alone can't tell
 * us how many rounds of playoffs exist (4 teams = 2 rounds, 6 teams =
 * 3 rounds). Caller computes once per division.
 *
 * @param finalsBestOf3 — when true and the row IS the final, append
 *  "(Best of 3)" so players know it's a series.
 */
export function matchPositionLabel(
  match: {
    round: number;
    match_number: number;
    bracket: string;
    series_game?: number | null;
  },
  maxPlayoffRound: number | null,
  finalsBestOf3: boolean = false
): string {
  if (match.bracket !== "playoff") {
    const pool = poolNameFromBracket(match.bracket);
    return `${pool} · Round ${match.round}`;
  }

  if (maxPlayoffRound == null) {
    return `Playoff · Round ${match.round}`;
  }

  if (match.round === maxPlayoffRound) {
    if (match.match_number === 2) return "3rd Place";
    // Best-of-3 finals split into individual game rows. The label
    // names the specific game so the queue and court tracker show
    // "Final · Game 1" / "Final · Game 2" / "Final · Game 3"
    // instead of three identical "Final" cards.
    if (match.series_game) {
      return `Final · Game ${match.series_game}`;
    }
    return finalsBestOf3 ? "Final (Best of 3)" : "Final";
  }
  const depth = maxPlayoffRound - match.round;
  if (depth === 1) return "Semifinal";
  if (depth === 2) return "Quarterfinal";
  // Round of 16, Round of 32, …
  return `Round of ${Math.pow(2, depth + 1)}`;
}

function poolNameFromBracket(bracket: string): string {
  if (bracket === "winners") return "Pool A";
  if (bracket === "losers") return "Pool B";
  if (bracket.startsWith("pool_")) return `Pool ${bracket.slice(5)}`;
  return bracket;
}
/** Deterministic hash used as the final "coin flip" tiebreaker. */
function stableIdHash(id: string): number {
  let h = 0;
  for (let k = 0; k < id.length; k++) {
    h = (h * 31 + id.charCodeAt(k)) | 0;
  }
  return h;
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
