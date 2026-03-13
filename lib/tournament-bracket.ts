/**
 * Tournament Bracket Generation
 *
 * Generates match structures for single elimination, double elimination,
 * and round robin formats.
 */

interface BracketMatch {
  round: number;
  match_number: number;
  bracket: "winners" | "losers" | "grand_final";
  player1_id: string | null;
  player2_id: string | null;
  status: "pending" | "bye";
}

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
  const byeCount = bracketSize - n;
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
  // Round 1 of losers: bracketSize/4 matches (losers from winners R1 play each other)
  let losersMatchesInRound = bracketSize / 4;
  for (let lr = 1; lr <= losersRounds; lr++) {
    const count = lr % 2 === 1 ? losersMatchesInRound : losersMatchesInRound;
    for (let m = 1; m <= count; m++) {
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

/**
 * Generate a round robin schedule.
 *
 * Uses the circle method to generate balanced rounds.
 * Every player plays every other player exactly once.
 */
export function generateRoundRobin(playerIds: string[]): BracketMatch[] {
  const n = playerIds.length;
  if (n < 2) return [];

  const players = [...playerIds];
  // If odd number, add a dummy player for byes
  if (n % 2 === 1) {
    players.push("BYE");
  }

  const numPlayers = players.length;
  const numRounds = numPlayers - 1;
  const matchesPerRound = numPlayers / 2;

  const matches: BracketMatch[] = [];

  // Circle method: fix player 0, rotate the rest
  for (let round = 0; round < numRounds; round++) {
    const roundMatches: [number, number][] = [];

    // First match: fixed player vs rotated player
    roundMatches.push([0, numPlayers - 1 - round === 0 ? 0 : ((numPlayers - 1 - round) % (numPlayers - 1)) || (numPlayers - 1)]);

    // Remaining matches
    for (let m = 1; m < matchesPerRound; m++) {
      const a = (m + round) % (numPlayers - 1) || (numPlayers - 1);
      const b = (numPlayers - 1 - m + round) % (numPlayers - 1) || (numPlayers - 1);
      if (a !== b) {
        roundMatches.push([a, b]);
      }
    }

    // Use a simpler round robin generation
    let matchNumber = 1;
    for (const [a, b] of roundMatches) {
      const p1 = players[a];
      const p2 = players[b];
      const isBye = p1 === "BYE" || p2 === "BYE";

      matches.push({
        round: round + 1,
        match_number: matchNumber++,
        bracket: "winners",
        player1_id: p1 === "BYE" ? null : p1,
        player2_id: p2 === "BYE" ? null : p2,
        status: isBye ? "bye" : "pending",
      });
    }
  }

  return matches;
}

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
