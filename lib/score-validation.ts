/**
 * Pickleball score validation.
 *
 * Used by every path that writes a game_results row (the score POST
 * route, the inline-edit endpoints, and the admin grid). Pure
 * function — no DB access — so it's trivially testable and runs
 * identically on the client (instant feedback) and the server
 * (authoritative gate).
 *
 * Rules:
 *   1. Both scores are non-negative integers.
 *   2. Scores can't tie (someone has to win).
 *   3. The winner's score must equal the score at which the game
 *      would have actually ended:
 *        - With win_by_2: max(gameLimit, loserScore + 2)
 *          A 16-14 game ends at 16-14, not 17-14 or 18-14 — once a
 *          team has ≥ gameLimit AND a 2-point lead, play stops.
 *        - Without win_by_2: exactly gameLimit.
 *          First to gameLimit wins; the loser can have anything from
 *          0 to gameLimit-1.
 *
 * The exact-ending rule is what catches 18-14 in a 15-point win-by-2
 * game: the older check only required margin ≥ 2 and a team ≥ 15,
 * which 18-14 satisfies — but the game can't have actually
 * progressed past 16-14.
 */

export interface ScoreValidationInput {
  scoreA: number;
  scoreB: number;
  gameLimit: number;
  winBy2: boolean;
}

export type ScoreValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateScore(input: ScoreValidationInput): ScoreValidationResult {
  const { scoreA, scoreB, gameLimit, winBy2 } = input;

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return { ok: false, error: "Scores must be whole numbers." };
  }
  if (scoreA < 0 || scoreB < 0) {
    return { ok: false, error: "Scores must be non-negative." };
  }
  if (scoreA === scoreB) {
    return { ok: false, error: "Game can't end tied — one team has to win." };
  }

  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);

  if (winner < gameLimit) {
    return {
      ok: false,
      error: `At least one team must reach ${gameLimit} points.`,
    };
  }

  const expectedWinner = winBy2 ? Math.max(gameLimit, loser + 2) : gameLimit;

  if (winner !== expectedWinner) {
    if (winBy2) {
      // Two cases worth distinguishing for the message:
      //   - winner went past where the game would have ended
      //     (e.g. 18-14 in a 15-point win-by-2 → game ended at 16-14)
      //   - margin is too small (e.g. 16-15 → not a 2-point lead)
      if (winner - loser < 2) {
        return {
          ok: false,
          error: `Win-by-2 rule: the winner needs at least a 2-point lead. Got ${winner}-${loser}.`,
        };
      }
      return {
        ok: false,
        error: `Win-by-2 game ends at ${expectedWinner}-${loser} (first to ${gameLimit}, then 2-point lead). Got ${winner}-${loser}.`,
      };
    }
    return {
      ok: false,
      error: `Game ends at exactly ${gameLimit}. Got ${winner}-${loser}.`,
    };
  }

  return { ok: true };
}
