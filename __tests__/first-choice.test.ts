/**
 * First-choice helper tests
 *
 * The label needs three properties:
 *   1. **Deterministic** — same (session, court, game) always gives the
 *      same team, so re-renders and page reloads don't flip the badge.
 *   2. **Reactive** to any of the three inputs — changing session, court,
 *      or game number can flip which team holds first choice.
 *   3. **Roughly uniform** across a realistic session — neither team should
 *      be massively favored.
 */

import { matchFirstChoice } from "@/lib/first-choice";

const SESSION_A = "4f9d7c12-7e03-4d0e-b4a1-20a5f1c3a111";
const SESSION_B = "9a8c6d45-1b72-4f19-bc33-77c9e2d41842";

describe("matchFirstChoice", () => {
  test("is deterministic per (session, court, game)", () => {
    const first = matchFirstChoice(SESSION_A, 2, 3);
    for (let i = 0; i < 50; i++) {
      expect(matchFirstChoice(SESSION_A, 2, 3)).toBe(first);
    }
  });

  test("only ever returns 'team1' or 'team2'", () => {
    for (let court = 1; court <= 5; court++) {
      for (let game = 1; game <= 5; game++) {
        const result = matchFirstChoice(SESSION_A, court, game);
        expect(["team1", "team2"]).toContain(result);
      }
    }
  });

  test("different sessions can produce different labels for the same (court, game)", () => {
    // Not a guarantee for any specific pair, but across a lot of courts/games
    // at least some pairs MUST differ if the hash is pulling session in.
    let differed = false;
    for (let court = 1; court <= 5 && !differed; court++) {
      for (let game = 1; game <= 5 && !differed; game++) {
        if (
          matchFirstChoice(SESSION_A, court, game) !==
          matchFirstChoice(SESSION_B, court, game)
        ) {
          differed = true;
        }
      }
    }
    expect(differed).toBe(true);
  });

  test("changing game number within a court can flip the label", () => {
    const labels = new Set<string>();
    for (let game = 1; game <= 5; game++) {
      labels.add(matchFirstChoice(SESSION_A, 1, game));
    }
    // Within a court of 5 games we expect to see both labels show up.
    expect(labels.size).toBe(2);
  });

  test("distribution is roughly 50/50 across a realistic session shape", () => {
    // Four courts × 5 games × 10 synthetic sessions = 200 matches total.
    // A fair hash should land in ~40–60% team1 range.
    let team1 = 0;
    let total = 0;
    for (let s = 0; s < 10; s++) {
      const sid = `00000000-0000-4000-8000-0000000000${String(s).padStart(2, "0")}`;
      for (let court = 1; court <= 4; court++) {
        for (let game = 1; game <= 5; game++) {
          if (matchFirstChoice(sid, court, game) === "team1") team1++;
          total++;
        }
      }
    }
    const ratio = team1 / total;
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
  });
});
