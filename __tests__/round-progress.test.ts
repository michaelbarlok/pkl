import { expectedGamesPerCourt } from "@/lib/round-progress";

/**
 * expectedGamesPerCourt tests
 *
 * These lock the ticker math to the server's /complete-round
 * validation so "All scores in" means the admin can actually advance.
 */

describe("expectedGamesPerCourt", () => {
  test("4 players → 3 games", () => {
    expect(expectedGamesPerCourt(4)).toBe(3);
  });

  test("5 players → 5 games", () => {
    expect(expectedGamesPerCourt(5)).toBe(5);
  });

  test("6+ players still 5 (treated as a 5-slot pool — extras are byes)", () => {
    expect(expectedGamesPerCourt(6)).toBe(5);
    expect(expectedGamesPerCourt(10)).toBe(5);
  });

  test("under 4 → 0 games (shouldn't form a pool)", () => {
    expect(expectedGamesPerCourt(0)).toBe(0);
    expect(expectedGamesPerCourt(3)).toBe(0);
  });
});
