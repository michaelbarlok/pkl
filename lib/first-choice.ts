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

/**
 * Pick which of the two teams in a given match gets "first choice".
 *
 * Inputs:
 *   - sessionId: the shootout session UUID
 *   - courtNumber: the pool / court number within the session
 *   - gameNumber: the game index within the court (1-based)
 *
 * Output: "team1" or "team2".
 */
export function matchFirstChoice(
  sessionId: string,
  courtNumber: number,
  gameNumber: number
): "team1" | "team2" {
  const key = `${sessionId}:${courtNumber}:${gameNumber}`;
  return (hash32(key) & 1) === 0 ? "team1" : "team2";
}
