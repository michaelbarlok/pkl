/**
 * Count of round-robin games expected for a court based on how many
 * players are assigned to it.
 *
 *   4 players → 3 games (every pairing partners the 4 players once)
 *   5 players → 5 games (round-robin with a rotating bye)
 *
 * Mirrors the validation on /api/sessions/[id]/complete-round so the
 * UI's "X of Y matches played" ticker agrees with the server's
 * "all matches entered?" check.
 */
export function expectedGamesPerCourt(playersOnCourt: number): number {
  if (playersOnCourt >= 5) return 5;
  if (playersOnCourt >= 4) return 3;
  return 0;
}
