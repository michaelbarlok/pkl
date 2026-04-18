// ============================================================
// Free Play Engine — match generation with partner rotation
// ============================================================

export interface MatchAssignment {
  teamA: [string, string];
  teamB: [string, string];
}

export interface RoundResult {
  matches: MatchAssignment[];
  sitting: string[];
}

/**
 * Build a partner-pair key (order-independent).
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Generate a round of doubles matches.
 *
 * Guarantees:
 *  - Nobody sits twice in a row (unless unavoidable with ≤4 players per court).
 *  - Players with fewer total byes are preferred for the sit-out slot.
 *  - Partners rotate — minimises repeat partnerships across rounds.
 *  - Opponents rotate — secondarily minimises facing the same opponents.
 */
export function generateRound(
  players: string[],
  previousSitting: string[],
  partnerHistory: Record<string, number>,
  byeHistory: Record<string, number> = {},
  opponentHistory: Record<string, number> = {},
): RoundResult {
  const n = players.length;

  if (n < 4) {
    return { matches: [], sitting: [...players] };
  }

  const numCourts = Math.floor(n / 4);
  const numPlaying = numCourts * 4;
  const numSitting = n - numPlaying;

  const sitting = pickSitters(players, numSitting, new Set(previousSitting), byeHistory);
  const playing = players.filter((p) => !sitting.includes(p));
  const matches = formMatches(playing, partnerHistory, opponentHistory);

  return { matches, sitting };
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function pickSitters(
  players: string[],
  count: number,
  previouslySat: Set<string>,
  byeHistory: Record<string, number>
): string[] {
  if (count === 0) return [];

  // Split: didn't sit last round (eligible) vs. sat last round (ineligible)
  const eligible = players.filter((p) => !previouslySat.has(p));
  const ineligible = players.filter((p) => previouslySat.has(p));

  // Within eligible, prefer players with the fewest total byes.
  // Pre-shuffle so ties are broken randomly (JS sort is stable, so
  // equal-bye-count players maintain their shuffled order).
  const sortedEligible = shuffle([...eligible]).sort(
    (a, b) => (byeHistory[a] ?? 0) - (byeHistory[b] ?? 0)
  );

  const sitters = sortedEligible.slice(0, count);

  // Only use players who sat last round if we still need more sitters
  if (sitters.length < count) {
    const extra = shuffle([...ineligible]).slice(0, count - sitters.length);
    sitters.push(...extra);
  }

  return sitters;
}

/**
 * Try several random shuffles and pick the assignment that minimises
 * both repeat partnerships (weight ×2) and repeat opponents (weight ×1).
 */
function formMatches(
  players: string[],
  partnerHistory: Record<string, number>,
  opponentHistory: Record<string, number>
): MatchAssignment[] {
  let bestMatches: MatchAssignment[] = [];
  let bestScore = Infinity;

  const attempts = Math.min(200, Math.max(50, players.length * 20));

  for (let i = 0; i < attempts; i++) {
    const shuffled = shuffle([...players]);
    const matches: MatchAssignment[] = [];
    let score = 0;

    for (let j = 0; j < shuffled.length; j += 4) {
      const a = shuffled[j];
      const b = shuffled[j + 1];
      const c = shuffled[j + 2];
      const d = shuffled[j + 3];

      // Partner penalty (×2) — strongly avoid same partner
      score += (partnerHistory[pairKey(a, b)] ?? 0) * 2;
      score += (partnerHistory[pairKey(c, d)] ?? 0) * 2;

      // Opponent penalty (×1) — mildly avoid facing same opponents
      score += opponentHistory[pairKey(a, c)] ?? 0;
      score += opponentHistory[pairKey(a, d)] ?? 0;
      score += opponentHistory[pairKey(b, c)] ?? 0;
      score += opponentHistory[pairKey(b, d)] ?? 0;

      matches.push({ teamA: [a, b], teamB: [c, d] });
    }

    if (score < bestScore) {
      bestScore = score;
      bestMatches = matches;
    }

    if (bestScore === 0) break; // Perfect — no repeats at all
  }

  return bestMatches;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
