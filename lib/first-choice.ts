/**
 * "First choice" label for ladder session matches.
 *
 * One team in every ladder session match gets to pick whether to
 * serve/return first or which side of the court they play on. We don't
 * persist this per match — there's no "match row" for unscored games —
 * so instead we derive it deterministically from the (session, court,
 * game) triple so the same match always shows the same team, but across
 * a session's matches the assignment reads as random.
 *
 * This intentionally doesn't touch scoring, seeding, or standings — it's
 * purely a display label.
 */

/**
 * Hash a string to a 32-bit integer using FNV-1a plus a Murmur-style
 * avalanche finalizer. FNV-1a alone leaks its low bit straight through
 * (the prime is odd, so multiplication preserves bit 0), which means
 * string parity decides the 1-bit reduction — two UUIDs with matching
 * character parity would always produce the same label. The finalizer
 * mixes the high bits back down so each output bit depends on the full
 * input.
 */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Shared reducer: take any stable match-identifying string and flip it
 *  into "team1" or "team2". */
function firstChoiceFromKey(key: string): "team1" | "team2" {
  return (hash32(key) & 1) === 0 ? "team1" : "team2";
}

/**
 * Pick which of the two teams in a given **shootout ladder** match gets
 * "first choice".
 *
 * Inputs:
 *   - sessionId: the shootout session UUID
 *   - courtNumber: the pool / court number within the session
 *   - gameNumber: the game index within the court (1-based)
 */
export function matchFirstChoice(
  sessionId: string,
  courtNumber: number,
  gameNumber: number
): "team1" | "team2" {
  return firstChoiceFromKey(`${sessionId}:${courtNumber}:${gameNumber}`);
}

/**
 * Pick which of the two teams in a given **free play** match gets "first
 * choice". Free play matches are addressed by their position in a round
 * rather than by court, but the rule is identical: the team tagged gets
 * to pick serve/return or which side of the court.
 *
 * Inputs:
 *   - sessionId: the free_play_sessions UUID
 *   - roundNumber: the round the match belongs to
 *   - matchIndex: position of the match inside the round (0-based, matches
 *                 the order of `current_round.matches` in the DB)
 */
export function freePlayMatchFirstChoice(
  sessionId: string,
  roundNumber: number,
  matchIndex: number
): "team1" | "team2" {
  return firstChoiceFromKey(`fp:${sessionId}:${roundNumber}:${matchIndex}`);
}

/**
 * Pick first-choice across an ordered batch of matches with per-player
 * balance. For each match, the team whose two players have the lower
 * combined first-choice count so far wins it; ties fall back to a
 * deterministic hash of `fallbackKey`. Counts increment as we walk.
 *
 * In ladder play, partners rotate within a court (round-robin), so
 * assigning first-choice to a "team" position bites: with the standard
 * 4-player schedule, picking team1 every game would give one player
 * first-choice in all 3 games and the other 3 players in only 1 each.
 * Walking the schedule with a balance pass instead spreads it evenly:
 *   - 5-player rounds: every player ends with exactly 2 first-choices.
 *   - 4-player rounds: the schedule structure forces a 2-2-2-0 split
 *     per round (one player must miss out), but cross-round balancing
 *     rotates which player gets the 0 — so nobody goes a whole session
 *     without first-choice as long as they play multiple rounds.
 *
 * Free play uses the same algorithm to keep first-choice rotating
 * even when a round is rebuilt (admins reshape teams mid-session).
 *
 * Pass `initialCounts` to seed from prior rounds (or prior sessions)
 * so balance carries forward. Returns both the per-match assignment
 * and the running counts after the batch — handy when chaining.
 */
export function computeBalancedFirstChoices<
  M extends { team1: readonly string[]; team2: readonly string[] }
>(
  matches: readonly M[],
  fallbackKey: (match: M, index: number) => string,
  initialCounts?: Map<string, number>,
): {
  assignments: Map<M, "team1" | "team2">;
  finalCounts: Map<string, number>;
} {
  const counts = new Map<string, number>(initialCounts ?? []);
  const assignments = new Map<M, "team1" | "team2">();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const sumA = m.team1.reduce((s, p) => s + (counts.get(p) ?? 0), 0);
    const sumB = m.team2.reduce((s, p) => s + (counts.get(p) ?? 0), 0);

    let pick: "team1" | "team2";
    if (sumA < sumB) pick = "team1";
    else if (sumB < sumA) pick = "team2";
    else pick = firstChoiceFromKey(fallbackKey(m, i));

    assignments.set(m, pick);
    const winners = pick === "team1" ? m.team1 : m.team2;
    for (const p of winners) counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  return { assignments, finalCounts: counts };
}
